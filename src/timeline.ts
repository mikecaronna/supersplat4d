import { EventHandle } from 'playcanvas';

import { Events } from './events';

const registerTimelineEvents = (events: Events) => {
    let frames = 180;
    let frameRate = 30;
    let smoothness = 1;
    let isDynamic = false;
    let dynamicDuration = 0;
    let dynamicFps = 30;

    // frames

    const setFrames = (value: number) => {
        if (value !== frames) {
            frames = value;
            events.fire('timeline.frames', frames);
        }
    };

    events.function('timeline.frames', () => {
        return frames;
    });

    events.on('timeline.setFrames', (value: number) => {
        setFrames(value);
    });

    // frame rate

    const setFrameRate = (value: number) => {
        if (value !== frameRate) {
            frameRate = value;
            events.fire('timeline.frameRate', frameRate);
        }
    };

    events.function('timeline.frameRate', () => {
        return frameRate;
    });

    events.on('timeline.setFrameRate', (value: number) => {
        setFrameRate(value);
    });

    // smoothness

    const setSmoothness = (value: number) => {
        if (value !== smoothness) {
            smoothness = value;
            events.fire('timeline.smoothness', smoothness);
        }
    };

    events.function('timeline.smoothness', () => {
        return smoothness;
    });

    events.on('timeline.setSmoothness', (value: number) => {
        setSmoothness(value);
    });

    // current frame
    let frame = 0;

    const setFrame = (value: number) => {
        if (value !== frame) {
            frame = value;
            events.fire('timeline.frame', frame);
        }
    };

    events.function('timeline.frame', () => {
        return frame;
    });

    events.on('timeline.setFrame', (value: number) => {
        setFrame(value);
    });

    // anim controls
    let animHandle: EventHandle = null;

    // `bounce=1` in the URL plays the clip forward, then backward, instead of
    // cutting back to the start.
    //
    // Looping by modulo sends the last frame straight to the first, which is a
    // break in POSITION: everything in the scene moves at once and the eye
    // reads a jump cut. Turning round at the ends keeps position continuous and
    // breaks only VELOCITY, which reads as a bounce and is far less visible. It
    // also doubles the period, so a seam of any kind comes round half as often.
    //
    // Nothing is stored or precomputed: the model is continuous in time, so
    // asking it for a decreasing t costs exactly what increasing t costs.
    //
    // It is off by default because a velocity break is only cheap when the
    // motion has no strong direction to it. Drumming and strumming reverse
    // invisibly; a skateboarder in mid air does not, and reads as hitting a
    // wall.
    const bounce = new URL(window.location.href).searchParams.get('bounce') === '1';

    const play = () => {
        let time = frame;

        // handle application update tick
        animHandle = events.on('update', (dt: number) => {
            // Timeline always advances frames
            // Dynamic gaussians read frame from timeline and handle sorting themselves
            if (bounce && frames > 2) {
                // a triangle wave rather than a sawtooth. The period is
                // 2 * (frames - 1), not 2 * frames, so the two turning frames
                // are shown once each and not held for two ticks.
                const period = 2 * (frames - 1);
                time = (time + dt * frameRate) % period;
                const f = time <= frames - 1 ? time : period - time;
                setFrame(Math.min(frames - 1, Math.floor(f)));
            } else {
                time = (time + dt * frameRate) % frames;
                setFrame(Math.floor(time));
            }
        });
    };

    const stop = () => {
        animHandle.off();
        animHandle = null;
    };

    // playing state
    let playing = false;

    const setPlaying = (value: boolean) => {
        if (value !== playing) {
            playing = value;
            events.fire('timeline.playing', playing);
            if (playing) {
                play();
            } else {
                stop();
            }
        }
    };

    events.function('timeline.playing', () => {
        return playing;
    });

    events.on('timeline.setPlaying', (value: boolean) => {
        setPlaying(value);
    });

    // keys

    const keys: number[] = [];

    events.function('timeline.keys', () => {
        return keys;
    });

    events.on('timeline.addKey', (frame: number) => {
        keys.push(frame);
        events.fire('timeline.keyAdded', frame);
    });

    events.on('timeline.removeKey', (index: number) => {
        keys.splice(index, 1);
        events.fire('timeline.keyRemoved', index);
    });

    events.on('timeline.setKey', (index: number, frame: number) => {
        if (frame !== keys[index]) {
            keys[index] = frame;
            events.fire('timeline.keySet', index, frame);
        }
    });

    // dynamic mode

    events.function('timeline.isDynamic', () => {
        return isDynamic;
    });

    events.on('timeline.setDynamic', (duration: number, fps: number) => {
        isDynamic = true;
        dynamicDuration = duration;
        dynamicFps = fps;
        // Set frames based on duration and fps
        const totalFrames = Math.ceil(duration * fps);
        setFrames(totalFrames);
        setFrameRate(fps);
        events.fire('timeline.dynamicChanged', true);
    });

    events.on('timeline.setStatic', () => {
        isDynamic = false;
        events.fire('timeline.dynamicChanged', false);
    });

    // doc

    events.function('docSerialize.timeline', () => {
        return {
            frames,
            frameRate,
            frame,
            smoothness,
            isDynamic,
            dynamicDuration,
            dynamicFps
        };
    });

    events.function('docDeserialize.timeline', (data: any = {}) => {
        events.fire('timeline.setFrames', data.frames ?? 180);
        events.fire('timeline.setFrameRate', data.frameRate ?? 30);
        events.fire('timeline.setFrame', data.frame ?? 0);
        events.fire('timeline.setSmoothness', data.smoothness ?? 0);
        if (data.isDynamic && data.dynamicDuration && data.dynamicFps) {
            events.fire('timeline.setDynamic', data.dynamicDuration, data.dynamicFps);
        }
    });
};

export { registerTimelineEvents };
