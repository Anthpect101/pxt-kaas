//% weight=100 color=#ff6600 icon="\uf001" block="KAAS Audio Advanced"
namespace kaas {
    const stepTable = [
        7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,
        34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,
        157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,
        724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,
        3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,
        15289,16818,18500,20350,22385,24623,27086,29794,32767
    ]

    const indexTable = [-1,-1,-1,-1,2,4,6,8,-1,-1,-1,-1,2,4,6,8]

    export class KaasState {
        predictor: number
        stepIndex: number
        constructor() {
            this.predictor = 0
            this.stepIndex = 0
        }
    }

    let outputPin: AnalogPin = AnalogPin.P0
    let sampleRate: number = 8000
    let volume: number = 255
    let playing: boolean = false
    let paused: boolean = false
    let bufferQueue: Buffer[] = []
    let state: KaasState = new KaasState()

    // --- Decode single nibble ---
    function decodeNibble(nibble: number): number {
        let step = stepTable[state.stepIndex]
        let diff = step >> 3
        if (nibble & 1) diff += step >> 2
        if (nibble & 2) diff += step >> 1
        if (nibble & 4) diff += step
        if (nibble & 8) diff = -diff

        state.predictor += diff
        if (state.predictor > 127) state.predictor = 127
        if (state.predictor < -128) state.predictor = -128

        state.stepIndex += indexTable[nibble]
        if (state.stepIndex < 0) state.stepIndex = 0
        if (state.stepIndex > 88) state.stepIndex = 88

        return state.predictor + 128
    }

    // --- Decode whole buffer to PCM ---
    //% block="decode KAAS buffer %buf"
    export function decodeKAAS(buf: Buffer): number[] {
        let out: number[] = []
        for (let i = 0; i < buf.length; i++) {
            let b = buf[i]
            out.push(decodeNibble(b & 0x0F))
            out.push(decodeNibble(b >> 4))
        }
        return out
    }

    // --- Playback engine ---
    function playNextBuffer() {
        if (bufferQueue.length == 0) {
            playing = false
            return
        }
        let buf = bufferQueue.shift()
        playing = true
        paused = false
        control.inBackground(() => {
            let microsPerSample = 1000000 / sampleRate
            for (let i = 0; i < buf.length && playing && !paused; i++) {
                let b = buf[i]
                let s1 = decodeNibble(b & 0x0F)
                let s2 = decodeNibble(b >> 4)
                pins.analogWritePin(outputPin, (s1 * volume) >> 8)
                control.waitMicros(microsPerSample)
                pins.analogWritePin(outputPin, (s2 * volume) >> 8)
                control.waitMicros(microsPerSample)
            }
            // loop if there are more buffers
            if (bufferQueue.length > 0) playNextBuffer()
            else playing = false
        })
    }

    //% block="play KAAS buffer %buf"
    export function playKAAS(buf: Buffer) {
        bufferQueue.push(buf)
        if (!playing) playNextBuffer()
    }

    //% block="stop KAAS playback"
    export function stop() {
        playing = false
        paused = false
        bufferQueue = []
        pins.analogWritePin(outputPin, 0)
        state = new KaasState()
    }

    //% block="pause KAAS playback"
    export function pause() {
        paused = true
    }

    //% block="resume KAAS playback"
    export function resume() {
        if (paused) {
            paused = false
            if (!playing && bufferQueue.length > 0) playNextBuffer()
        }
    }

    //% block="set KAAS output pin %pin"
    export function setOutputPin(pin: AnalogPin) {
        outputPin = pin
    }

    //% block="set KAAS sample rate %rate"
    export function setSampleRate(rate: number) {
        sampleRate = rate
    }

    //% block="set KAAS volume %vol"
    export function setVolume(vol: number) {
        if (vol < 0) vol = 0
        if (vol > 255) vol = 255
        volume = vol
    }

    //% block="queue KAAS buffer %buf"
    export function queueBuffer(buf: Buffer) {
        bufferQueue.push(buf)
        if (!playing) playNextBuffer()
    }

    //% block="clear KAAS queue"
    export function clearQueue() {
        bufferQueue = []
    }
}
