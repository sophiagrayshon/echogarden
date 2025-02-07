import { extendDeep } from "../utilities/ObjectUtilities.js"
import { Logger } from "../utilities/Logger.js"
import { resampleAudioSpeex } from "./SpeexResampler.js"
import { computeMelSpectogram } from "./MelSpectogram.js"
import { RawAudio, powerToDecibels } from "../audio/AudioUtilities.js"
import { normalizeVectors } from "../math/VectorMath.js"

export async function computeMFCCs(monoAudio: RawAudio, options: MfccOptions = {}) {
	const logger = new Logger()
	logger.start("Initialize options")

	if (monoAudio.audioChannels.length != 1) {
		throw new Error("Audio must be mono")
	}

	options = extendDefaultMfccOptions(options)

	const analysisSampleRate = options.analysisSampleRate!
	const featureCount = options.featureCount!

	const fftOrder = options.fftOrder!

	const windowDuration = options.windowDuration!
	const windowSize = windowDuration * analysisSampleRate
	const hopDuration = options.hopDuration!
	const hopLength = hopDuration * analysisSampleRate

	const filterbankCount = options.filterbankCount!
	const lowerFrequencyHz = options.lowerFreq!
	const upperFrequencyHz = options.upperFreq!

	const emphasisFactor = options.emphasisFactor!
	const lifteringFactor = options.lifteringFactor!
	const zeroFirstCoefficient = options.zeroFirstCoefficient!

	const method = options.method!

	logger.start(`Resample audio to analysis sample rate (${analysisSampleRate}Hz)`)
	const resampledAudio = await resampleAudioSpeex(monoAudio, analysisSampleRate)

	let mfccs: number[][]

	if (method == "default") {
		if (emphasisFactor > 0) {
			logger.start("Apply emphasis")
			resampledAudio.audioChannels[0] = applyEmphasis(resampledAudio.audioChannels[0], emphasisFactor)
		}

		logger.start("Compute Mel spectogram")
		const { melSpectogram } = await computeMelSpectogram(resampledAudio, fftOrder, windowSize, hopLength, filterbankCount, lowerFrequencyHz, upperFrequencyHz)

		logger.start("Extract MFCCs from Mel spectogram")
		const mfccsFloat32 = melSpectogramToMFCCs(melSpectogram, featureCount)

		mfccs = mfccsFloat32.map(mfcc => Array.from(mfcc))
	} else {
		throw new Error("Invalid MFCC method")
	}

	if (options.normalize!) {
		logger.start("Normalize MFCCs")

		const { normalizedVectors, mean, stdDeviation } = normalizeVectors(mfccs)
		mfccs = normalizedVectors
		//mfccs = mfccs.map(mfcc => subtractVectors(mfcc, mean))
	}

	if (lifteringFactor > 0) {
		logger.start("Apply liftering to MFCCs")
		mfccs = applyLiftering(mfccs, lifteringFactor)
	}

	if (zeroFirstCoefficient) {
		for (const mfcc of mfccs) {
			mfcc[0] = 0
		}
	}

	logger.end()

	return mfccs
}

export function melSpectogramToMFCCs(melSpectogram: Float32Array[], mfccFeatureCount: number) {
	const melBandCount = melSpectogram[0].length
	const dctMatrix = createDCTType2CoefficientMatrix(mfccFeatureCount, melBandCount)

	const mfccs = melSpectogram.map(frame => melSpectrumToMFCC(frame, mfccFeatureCount, dctMatrix))

	return mfccs
}

export function melSpectrumToMFCC(melSpectrum: Float32Array, mfccFeatureCount: number, dctMatrix: Float32Array[], normalization: "none" | "orthonormal" = "orthonormal") {
	const melBandCount = melSpectrum.length

	let firstFeatureNormalizationFactor: number
	let nonfirstFeatureNormalizationFactor: number

	if (normalization == "orthonormal") {
		firstFeatureNormalizationFactor = Math.sqrt(1 / (4 * mfccFeatureCount))
		nonfirstFeatureNormalizationFactor = Math.sqrt(1 / (2 * mfccFeatureCount))
	} else {
		firstFeatureNormalizationFactor = 1
		nonfirstFeatureNormalizationFactor = 1
	}

	const mfcc = new Float32Array(mfccFeatureCount)

	for (let mfccFeatureIndex = 0; mfccFeatureIndex < mfccFeatureCount; mfccFeatureIndex++) {
		const dctMatrixRow = dctMatrix[mfccFeatureIndex]

		let sum = 0

		for (let j = 0; j < melBandCount; j++) {
			const dctCoefficient = dctMatrixRow[j]
			const logMel = powerToDecibels(melSpectrum[j])
			//const logMel = Math.log(1e-40 + melSpectrum[j])

			sum += dctCoefficient * logMel
		}

		const normalizationFactor = mfccFeatureIndex == 0 ? firstFeatureNormalizationFactor : nonfirstFeatureNormalizationFactor

		//mfcc[mfccFeatureIndex] = normalizationFactor * sum
		mfcc[mfccFeatureIndex] = normalizationFactor * 2 * sum // Sum multiplied by 2 to match with librosa
	}

	return mfcc
}

export function createDCTType2CoefficientMatrix(mfccFeatureCount: number, melBandCount: number) {
	const dctMatrix = new Array<Float32Array>(mfccFeatureCount)

	for (let mfccFeatureIndex = 0; mfccFeatureIndex < mfccFeatureCount; mfccFeatureIndex++) {
		const row = new Float32Array(melBandCount)

		const innerMultiplier = Math.PI * mfccFeatureIndex / melBandCount

		for (let melBandIndex = 0; melBandIndex < melBandCount; melBandIndex++) {
			row[melBandIndex] = Math.cos(innerMultiplier * (melBandIndex + 0.5))
		}

		dctMatrix[mfccFeatureIndex] = row
	}

	return dctMatrix
}

export function mfccBufferToVectors(mfccBuffer: Float64Array, mfccFeatureCount: number) {
	if (mfccBuffer.length % mfccFeatureCount != 0) {
		throw new Error(`MFCC buffer length is not a multiple of the expected feature count (${mfccFeatureCount})`)
	}

	const mfccVectors: number[][] = []

	for (let offset = 0; offset < mfccBuffer.length; offset += mfccFeatureCount) {
		const mfccVector = Array.from(mfccBuffer.subarray(offset, offset + mfccFeatureCount))

		mfccVectors.push(mfccVector)
	}

	return mfccVectors
}

export function applyEmphasis(samples: Float32Array, emphasisFactor = 0.97, initialState = 0) {
	const processedSamples = new Float32Array(samples.length)

	processedSamples[0] = samples[0] - (emphasisFactor * initialState)

	for (let i = 1; i < processedSamples.length; i++) {
		processedSamples[i] = samples[i] - (emphasisFactor * samples[i - 1])
	}

	return processedSamples
}

export function applyLiftering(mfccs: number[][], lifteringFactor: number) {
	const featureCount = mfccs[0].length

	const lifterMultipliers = new Float32Array(featureCount)

	for (let i = 0; i < featureCount; i++) {
		lifterMultipliers[i] = 1 + (lifteringFactor / 2) * Math.sin(Math.PI * (i + 1) / lifteringFactor)
	}

	const lifteredMfccs: number[][] = []

	for (const mfcc of mfccs) {
		const lifteredMfcc = new Array(featureCount)

		for (let i = 0; i < featureCount; i++) {
			lifteredMfcc[i] = mfcc[i] * lifterMultipliers[i]
		}

		lifteredMfccs.push(lifteredMfcc)
	}

	return lifteredMfccs
}

export type MfccOptions = {
	filterbankCount?: number
	featureCount?: number
	fftOrder?: number
	lowerFreq?: number
	upperFreq?: number
	windowDuration?: number
	hopDuration?: number
	emphasisFactor?: number
	analysisSampleRate?: number
	lifteringFactor?: number
	normalize?: boolean
	zeroFirstCoefficient?: boolean
	method?: "default" | "cmfcc"
}

export const defaultMfccOptions: MfccOptions = {
	filterbankCount: 40,
	featureCount: 13,
	fftOrder: 512,
	lowerFreq: 133.3333,
	upperFreq: 6855.4976,
	windowDuration: 0.025,
	hopDuration: 0.010,
	emphasisFactor: 0.97,
	analysisSampleRate: 16000,
	lifteringFactor: 0,
	normalize: false,
	zeroFirstCoefficient: false,
	method: "default"
}

export function extendDefaultMfccOptions(options: MfccOptions) {
	return extendDeep(defaultMfccOptions, options)
}
