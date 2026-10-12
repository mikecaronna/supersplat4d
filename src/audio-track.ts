import { Events } from './events';

/**
 * Play a sound track alongside a 4D scene, locked to the timeline.
 *
 *   ?audio=https://host/clip.wav
 *
 * The captures carry usable audio and it needs no alignment: each source clip
 * holds PCM in the same container as the timecode the frames were cut by, so
 * a track extracted for a window already starts where the window starts.
 *
 * WHY IT FOLLOWS THE TIMELINE RATHER THAN RUNNING BESIDE IT. The scene's clock
 * is driven by the render loop, which drifts with frame rate and stalls when
 * the tab is backgrounded. An <audio> element has its own steady clock. Left
 * to run independently the two separate within a few seconds. So the timeline
 * is the authority: every frame sets a target time, and the track is nudged
 * only when it has drifted beyond what anyone can hear.
 *
 * The correction is deliberately loose. Assigning currentTime on every frame
 * makes an audible stutter, because each seek restarts the decoder. A window
 * of 120 ms is below the threshold where sound and picture read as separate
 * for this material, which is percussive and therefore the least forgiving.
 *
 * AUTOPLAY. Browsers refuse to start audible playback without a gesture, and
 * there is no way around that and no reason to want one. The track begins
 * muted and a speaker button in the corner turns it on, which also leaves
 * someone who did not want sound alone.
 *
 * BOUNCE. `bounce=1` plays the clip forward then backward. Audio cannot run
 * backward, so on the reverse leg the track keeps going forward and is
 * resynced at the turn. It suits the scenes that do not bounce; for ones that
 * do, expect the sound to be a loop under the picture rather than locked.
 *
 * @param {Events} events - the application event bus, used to follow the timeline
 */
const registerAudioTrack = (events: Events) => {
    const url = new URL(window.location.href).searchParams.get('audio');
    if (!url) {
        return;
    }

    // Correction thresholds. A seek restarts the decoder and is audible, so
    // small drift is pulled in by nudging the playback rate instead and only
    // a gross mismatch is seeked. Measured need: a hidden tab throttles
    // requestAnimationFrame to 1 fps, so the scene crawls and the audio runs
    // away from it; without the nudge that produced a seek every frame.
    const NUDGE = 0.04;         // below this, leave it alone
    const SEEK = 0.45;          // above this, the rate cannot catch up in time

    const el = document.createElement('audio');
    el.src = url;
    el.loop = true;
    el.muted = true;            // until the viewer asks for sound
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';   // the scenes are served from R2
    document.body.appendChild(el);

    let frameRate = 30;
    let frames = 0;
    let wanted = false;         // has the viewer turned sound on

    events.on('timeline.frameRate', (value: number) => {
        frameRate = value || 30;
    });
    events.on('timeline.frames', (value: number) => {
        frames = value || 0;
    });

    // Where in the track a given frame should be.
    //
    // Frame over frame rate is the obvious answer and it is wrong here. The
    // viewer stores the rate as an integer, so a 29.97 fps scene plays at 29
    // and its loop runs 2.172 s where the track is 2.069. Mapping by time
    // then overruns the end of the track and wraps early, which is an audible
    // jump on every loop.
    //
    // When the track covers the scene's span, which is how these are cut, the
    // two loops are mapped onto each other proportionally and the ends meet
    // exactly whatever the rate rounding does. A track of some other length,
    // a music bed say, falls back to real time.
    const targetFor = (frame: number) => {
        const sceneDur = frames > 0 ? frames / frameRate : 0;
        const matched = sceneDur > 0 &&
            Math.abs(el.duration - sceneDur) / sceneDur < 0.15;
        if (matched && frames > 1) {
            return (frame / frames) * el.duration;
        }
        return Math.min(frame / frameRate, Math.max(el.duration - 0.01, 0));
    };

    // The timeline is the authority; the track is corrected towards it.
    events.on('timeline.frame', (frame: number) => {
        if (el.readyState < 2 || !el.duration || el.paused) {
            return;
        }
        const target = targetFor(frame);
        let drift = el.currentTime - target;
        // across the loop seam the shorter way round is the real error
        if (drift > el.duration / 2) {
            drift -= el.duration;
        } else if (drift < -el.duration / 2) {
            drift += el.duration;
        }

        if (Math.abs(drift) > SEEK) {
            el.currentTime = target;
            el.playbackRate = 1;
        } else if (Math.abs(drift) > NUDGE) {
            // ahead of the scene plays slower, behind plays faster. Kept
            // inside a few percent, which is below the pitch shift anyone
            // notices on percussion.
            el.playbackRate = Math.max(0.94, Math.min(1.06, 1 - drift * 0.6));
        } else {
            el.playbackRate = 1;
        }
    });

    // A hidden tab throttles the render loop, so the scene all but stops while
    // the track would run on. Stopping with it keeps them together and means
    // coming back does not need a correction.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            el.pause();
        } else if (wanted && events.invoke('timeline.playing')) {
            el.play().catch(() => {});
        }
    });

    events.on('timeline.playing', (playing: boolean) => {
        // document.hidden is checked here as well as on visibilitychange,
        // because that event only fires on a CHANGE: a page opened in a
        // background tab is already hidden and would otherwise start playing
        // against a scene whose render loop is throttled to a crawl.
        if (playing && wanted && !document.hidden) {
            el.play().catch(() => {
                // Refused: either no gesture yet or the file did not load.
                // Silence is the right failure here, so the scene still plays.
            });
        } else {
            el.pause();
        }
    });

    // the speaker button
    const btn = document.createElement('button');
    btn.id = 'audio-toggle';
    btn.type = 'button';
    btn.title = 'Sound';
    btn.setAttribute('aria-label', 'Turn sound on');
    btn.textContent = 'Sound off';
    Object.assign(btn.style, {
        position: 'absolute',
        right: '12px',
        top: '12px',
        zIndex: '10000',
        padding: '7px 12px',
        font: '500 13px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif',
        color: '#f2f2f0',
        background: 'rgba(12,12,14,.72)',
        border: '1px solid rgba(255,255,255,.18)',
        borderRadius: '7px',
        cursor: 'pointer',
        backdropFilter: 'blur(6px)'
    });

    btn.addEventListener('click', () => {
        wanted = !wanted;
        el.muted = !wanted;
        btn.textContent = wanted ? 'Sound on' : 'Sound off';
        btn.setAttribute('aria-label', wanted ? 'Turn sound off' : 'Turn sound on');
        if (wanted) {
            // This click is the gesture the browser was waiting for.
            el.play().catch(() => {
                btn.textContent = 'Sound unavailable';
            });
        } else {
            el.pause();
        }
    });

    document.body.appendChild(btn);
};

export { registerAudioTrack };
