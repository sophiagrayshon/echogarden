import createMedianFilter from 'moving-median'

export function covarianceMatrixOfSamples(samples: number[][], weights?: number[], biased = false) {
	if (samples.length == 0) {
		throw new Error("No vectors given")
	}

	const { centeredVectors: centeredSamples, mean } = centerVectors(samples, weights)

	let covarianceMatrix

	if (weights) {
		covarianceMatrix = weightedCovarianceMatrixOfCenteredSamples(centeredSamples, weights)
	} else {
		covarianceMatrix = covarianceMatrixOfCenteredSamples(centeredSamples, biased)
	}

	return { covarianceMatrix, mean }
}

export function covarianceMatrixOfCenteredSamples(centeredSamples: number[][], biased = false, diagonalRegularizationAmount = 1e-6) {
	const sampleCount = centeredSamples.length

	if (sampleCount == 0) {
		throw new Error("No vectors given")
	}

	const sampleSizeMetric = biased || sampleCount == 1 ? sampleCount : sampleCount - 1
	const featureCount = centeredSamples[0].length

	const covarianceMatrix = createVectorArray(featureCount, featureCount)

	if (sampleCount == 1) {
		return covarianceMatrix
	}

	for (let i = 0; i < featureCount; i++) {
		for (let j = 0; j < featureCount; j++) {
			if (i > j) {
				covarianceMatrix[i][j] = covarianceMatrix[j][i]
				continue
			}

			let matrixElement = 0.0

			for (const sample of centeredSamples) {
				matrixElement += sample[i] * sample[j]
			}

			matrixElement /= sampleSizeMetric

			if (i == j) {
				matrixElement += diagonalRegularizationAmount
			}

			covarianceMatrix[i][j] = matrixElement
		}
	}

	return covarianceMatrix
}

export function weightedCovarianceMatrixOfCenteredSamples(centeredSamples: number[][], weights: number[], diagonalRegularizationAmount = 1e-6) {
	const sampleCount = centeredSamples.length

	if (sampleCount == 0) {
		throw new Error("No vectors given")
	}

	const featureCount = centeredSamples[0].length

	const covarianceMatrix = createVectorArray(featureCount, featureCount)

	if (sampleCount == 1) {
		return covarianceMatrix
	}

	for (let i = 0; i < featureCount; i++) {
		for (let j = 0; j < featureCount; j++) {
			if (i > j) {
				covarianceMatrix[i][j] = covarianceMatrix[j][i]
				continue
			}

			let matrixElement = 0.0

			for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
				const sample = centeredSamples[sampleIndex]
				const weight = weights[sampleIndex]

				matrixElement += weight * (sample[i] * sample[j])
			}

			if (i == j) {
				matrixElement += diagonalRegularizationAmount
			}

			covarianceMatrix[i][j] = matrixElement
		}
	}

	return covarianceMatrix
}

export function centerVectors(vectors: number[][], weights?: number[]) {
	const vectorCount = vectors.length

	if (vectorCount == 0) {
		return { centeredVectors: [], mean: [] }
	}

	let mean: number[]
	if (weights) {
		mean = weightedMeanOfVectors(vectors, weights)
	} else {
		mean = meanOfVectors(vectors)
	}

	const centeredVectors: number[][] = new Array(vectorCount)

	for (let i = 0; i < vectorCount; i++) {
		centeredVectors[i] = subtractVectors(vectors[i], mean)
	}

	return { centeredVectors, mean }
}

export function centerVector(vector: number[]) {
	const mean = meanOfVector(vector)

	const centeredVector: number[] = new Array(vector.length)

	for (let i = 0; i < vector.length; i++) {
		centeredVector[i] = vector[i] - mean
	}

	return centeredVector
}

export function scaleToSumTo1(vector: number[]) {
	if (vector.length == 0) {
		return []
	}

	if (vector.length == 1) {
		return [1]
	}

	const minValue = vector[indexOfMin(vector)]

	const scaledVector = vector.slice()

	if (minValue < 0) {
		const addedOffset = -minValue * 2

		for (let i = 0; i < scaledVector.length; i++) {
			scaledVector[i] += addedOffset
		}
	}

	const sum = sumVector(scaledVector)

	if (sum == 0) {
		return scaledVector
	}

	if (sum == Infinity) {
		throw new Error("Vector sum is infinite")
	}

	for (let i = 0; i < vector.length; i++) {
		scaledVector[i] /= sum

		scaledVector[i] = zeroIfNaN(scaledVector[i])
	}

	return scaledVector
}

export function normalizeVector(vector: number[], kind: "population" | "sample" = "population") {
	if (vector.length == 0) {
		throw new Error("Vector is empty")
	}

	const mean = meanOfVector(vector)
	const stdDeviation = stdDeviationOfVector(vector, kind, mean)

	const normalizedVector = createVector(vector.length)

	for (let i = 0; i < vector.length; i++) {
		normalizedVector[i] = (vector[i] - mean) / stdDeviation

		normalizedVector[i] = zeroIfNaN(normalizedVector[i])
	}

	return { normalizedVector, mean, stdDeviation }
}

export function normalizeVectors(vectors: number[][], kind: "population" | "sample" = "population") {
	const vectorCount = vectors.length

	if (vectorCount == 0) {
		return { normalizedVectors: [], mean: [], stdDeviation: [] }
	}

	const featureCount = vectors[0].length

	const mean = meanOfVectors(vectors)
	const stdDeviation = stdDeviationOfVectors(vectors, kind, mean)

	const normalizedVectors: number[][] = []

	for (const vector of vectors) {
		const normalizedVector = createVector(featureCount)

		for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
			normalizedVector[featureIndex] = (vector[featureIndex] - mean[featureIndex]) / stdDeviation[featureIndex]

			normalizedVector[featureIndex] = zeroIfNaN(normalizedVector[featureIndex])
		}

		normalizedVectors.push(normalizedVector)
	}

	return { normalizedVectors, mean, stdDeviation }
}

export function deNormalizeVectors(normalizedVectors: number[][], originalMean: number[], originalStdDeviation: number[]) {
	const vectorCount = normalizeVectors.length

	if (vectorCount == 0) {
		return []
	}

	const featureCount = normalizedVectors[0].length

	const deNormalizedVectors: number[][] = []

	for (const normalizedVector of normalizedVectors) {
		const deNormalizedVector = createVector(featureCount)

		for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
			deNormalizedVector[featureIndex] = originalMean[featureIndex] + (normalizedVector[featureIndex] * originalStdDeviation[featureIndex])
		}

		deNormalizedVectors.push(deNormalizedVector)
	}

	return deNormalizedVectors
}

export function meanOfVectors(vectors: number[][]) {
	const vectorCount = vectors.length

	if (vectorCount == 0) {
		return []
	}

	const featureCount = vectors[0].length

	const result = createVector(featureCount)

	for (const vector of vectors) {
		for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
			result[featureIndex] += vector[featureIndex]
		}
	}

	for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
		result[featureIndex] /= vectorCount
	}

	return result
}

export function weightedMeanOfVectors(vectors: number[][], weights: number[]) {
	const vectorCount = vectors.length

	if (vectorCount == 0) {
		return []
	}

	const featureCount = vectors[0].length

	const result = createVector(featureCount)

	for (let vectorIndex = 0; vectorIndex < vectorCount; vectorIndex++) {
		const vector = vectors[vectorIndex]
		const vectorWeight = weights[vectorIndex]

		for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
			result[featureIndex] += vectorWeight * vector[featureIndex]
		}
	}

	return result
}

export function stdDeviationOfVectors(vectors: number[][], kind: "population" | "sample" = "population", mean?: number[]) {
	return varianceOfVectors(vectors, kind, mean).map(v => Math.sqrt(v))
}

export function varianceOfVectors(vectors: number[][], kind: "population" | "sample" = "population", mean?: number[]) {
	const vectorCount = vectors.length

	if (vectorCount == 0) {
		return []
	}

	const sampleSizeMetric = kind == "population" || vectorCount == 1 ? vectorCount : vectorCount - 1
	const featureCount = vectors[0].length

	if (!mean) {
		mean = meanOfVectors(vectors)
	}

	const result = createVector(featureCount)

	for (const vector of vectors) {
		for (let i = 0; i < featureCount; i++) {
			result[i] += (vector[i] - mean[i]) ** 2
		}
	}

	for (let i = 0; i < featureCount; i++) {
		result[i] /= sampleSizeMetric
	}

	return result
}

export function meanOfVector(vector: number[]) {
	if (vector.length == 0) {
		throw new Error("Vector is empty")
	}

	return sumVector(vector) / vector.length
}

export function medianOfVector(vector: number[]) {
	if (vector.length == 0) {
		throw new Error("Vector is empty")
	}

	return vector[Math.floor(vector.length / 2)]
}

export function stdDeviationOfVector(vector: number[], kind: "population" | "sample" = "population", mean?: number) {
	return Math.sqrt(varianceOfVector(vector, kind, mean))
}

export function varianceOfVector(vector: number[], kind: "population" | "sample" = "population", mean?: number) {
	if (vector.length == 0) {
		throw new Error("Vector is empty")
	}

	const sampleSizeMetric = kind == "population" || vector.length == 1 ? vector.length : vector.length - 1

	if (mean == null) {
		mean = meanOfVector(vector)
	}

	let result = 0.0

	for (const value of vector) {
		result += (value - mean) ** 2
	}

	return result / sampleSizeMetric
}

export function logOfVector(vector: number[], minVal = 1e-40) {
	return vector.map(value => Math.log(minVal + value))
}

export function expOfVector(vector: number[]) {
	return vector.map(value => Math.exp(value))
}

export function transpose(matrix: number[][]) {
	const vectorCount = matrix.length
	const featureCount = matrix[0].length

	const transposedMatrix = createVectorArray(featureCount, vectorCount)

	for (let i = 0; i < vectorCount; i++) {
		for (let j = 0; j < featureCount; j++) {
			transposedMatrix[j][i] = matrix[i][j]
		}
	}

	return transposedMatrix
}

export function movingAverageOfWindow3(vector: number[]) {
	const elementCount = vector.length

	if (elementCount == 0) {
		return []
	}

	if (elementCount == 1) {
		return vector.slice()
	}

	const result: number[] = []

	result.push((vector[0] + vector[0] + vector[1]) / 3)

	for (let i = 1; i < elementCount - 1; i++) {
		result.push((vector[i - 1] + vector[i] + vector[i + 1]) / 3)
	}

	result.push((vector[elementCount - 2] + vector[elementCount - 1] + vector[elementCount - 1]) / 3)

	return result
}

export function averageMeanSquaredError(actual: number[][], expected: number[][]) {
	if (actual.length != expected.length) {
		throw new Error("Vectors are not the same length")
	}

	const vectorCount = actual.length

	if (vectorCount == 0) {
		return 0
	}

	let sum = 0.0

	for (let i = 0; i < vectorCount; i++) {
		sum += meanSquaredError(actual[i], expected[i])
	}

	return sum / vectorCount
}

export function meanSquaredError(actual: number[], expected: number[]) {
	if (actual.length != expected.length) {
		throw new Error("Vectors are not the same length")
	}

	const featureCount = actual.length

	if (featureCount == 0) {
		return 0
	}

	let sum = 0.0

	for (let i = 0; i < featureCount; i++) {
		sum += (actual[i] - expected[i]) ** 2
	}

	return sum / featureCount
}

export function eucledianDistance(vector1: number[], vector2: number[]) {
	return Math.sqrt(squaredEucledianDistance(vector1, vector2))
}

export function squaredEucledianDistance(vector1: number[], vector2: number[]) {
	if (vector1.length != vector2.length) {
		throw new Error("Vectors are not the same length")
	}

	const elementCount = vector1.length

	if (elementCount == 0) {
		return 0
	}

	let sum = 0.0

	for (let i = 0; i < elementCount; i++) {
		sum += (vector1[i] - vector2[i]) ** 2
	}

	return sum
}

export function cosineDistance(vector1: number[], vector2: number[]) {
	return 1 - cosineSimilarity(vector1, vector2)
}

export function cosineSimilarity(vector1: number[], vector2: number[]) {
	if (vector1.length != vector2.length) {
		throw new Error("Vectors are not the same length")
	}

	if (vector1.length == 0) {
		return 0
	}

	const elementCount = vector1.length

	let dotProduct = 0.0

	let squaredMagnitude1 = 0.0
	let squaredMagnitude2 = 0.0

	for (let i = 0; i < elementCount; i++) {
		dotProduct += vector1[i] * vector2[i]

		squaredMagnitude1 += vector1[i] ** 2
		squaredMagnitude2 += vector2[i] ** 2
	}

	const result = dotProduct / (Math.sqrt(squaredMagnitude1) * Math.sqrt(squaredMagnitude2))

	return zeroIfNaN(result)
}

export function minkowskiDistance(vector1: number[], vector2: number[], power: number) {
	if (vector1.length != vector2.length) {
		throw new Error("Vectors are not the same length")
	}

	const elementCount = vector1.length

	if (elementCount == 0) {
		return 0
	}

	let sum = 0.0

	for (let i = 0; i < elementCount; i++) {
		sum += Math.abs(vector1[i] - vector2[i]) ** power
	}

	return sum ** (1 / power)
}

export function cosineDistancePrecomputedMagnitudes(vector1: number[], vector2: number[], magnitude1: number, magnitude2: number) {
	return 1 - cosineSimilarityPrecomputedMagnitudes(vector1, vector2, magnitude1, magnitude2)
}

export function cosineSimilarityPrecomputedMagnitudes(vector1: number[], vector2: number[], magnitude1: number, magnitude2: number) {
	if (vector1.length != vector2.length) {
		throw new Error("Vectors are not the same length")
	}

	if (vector1.length == 0) {
		return 0
	}

	const featureCount = vector1.length

	let dotProduct = 0.0

	for (let i = 0; i < featureCount; i++) {
		dotProduct += vector1[i] * vector2[i]
	}

	const result = dotProduct / (magnitude1 * magnitude2)

	return zeroIfNaN(result)
}


export function subtractVectors(vector1: number[], vector2: number[]) {
	if (vector1.length != vector2.length) {
		throw new Error("Vectors are not the same length")
	}

	const result = createVector(vector1.length)

	for (let i = 0; i < vector1.length; i++) {
		result[i] = vector1[i] - vector2[i]
	}

	return result
}

export function sumVector(vector: number[]) {
	let result = 0.0

	for (let i = 0; i < vector.length; i++) {
		result += vector[i]
	}

	return result
}

export function dotProduct(vector1: number[], vector2: number[]) {
	if (vector1.length != vector2.length) {
		throw new Error("Vectors are not the same length")
	}

	const elementCount = vector1.length

	let result = 0.0

	for (let i = 0; i < elementCount; i++) {
		result += vector1[i] * vector2[i]
	}

	return result
}

export function magnitude(vector: number[]) {
	const featureCount = vector.length

	let squaredMagnitude = 0.0

	for (let i = 0; i < featureCount; i++) {
		squaredMagnitude += vector[i] ** 2
	}

	return Math.sqrt(squaredMagnitude)
}

export function maxValue(vector: number[]) {
	return vector[indexOfMax(vector)]
}

export function indexOfMax(vector: number[]) {
	let maxValue = -Infinity
	let result = -1

	for (let i = 0; i < vector.length; i++) {
		if (vector[i] > maxValue) {
			maxValue = vector[i]
			result = i
		}
	}

	return result
}

export function minValue(vector: number[]) {
	return vector[indexOfMin(vector)]
}

export function indexOfMin(vector: number[]) {
	let minValue = Infinity
	let result = -1

	for (let i = 0; i < vector.length; i++) {
		if (vector[i] < minValue) {
			minValue = vector[i]
			result = i
		}
	}

	return result
}

export function exponentialSmoothingMeanOfVectors(vectors: number[][], smoothingFactor: number) {
	const vectorCount = vectors.length

	if (vectorCount == 0) {
		return []
	}

	const featureCount = vectors[0].length

	const currentEstimate = createVector(featureCount)

	for (let i = 0; i < vectorCount; i++) {
		for (let j = 0; j < featureCount; j++) {
			const value = vectors[i][j]

			currentEstimate[j] = (smoothingFactor * value) + ((1 - smoothingFactor) * currentEstimate[j])
		}
	}

	return currentEstimate
}

export function sigmoid(x: number) {
	const result = 1 / (1 + Math.exp(-x))

	return zeroIfNaN(result)
}

export function softmax(logits: number[], temperature = 1.0) {
	if (logits.length == 0) {
		return []
	}

	let maxValue = -Infinity

	for (const val of logits) {
		if (val > maxValue) {
			maxValue = val
		}
	}

	const temperatureMultiplier = 1 / temperature

	const result: number[] = []

	let sumOfExponentiatedValues = 0.0

	for (const value of logits) {
		const eToValue = Math.exp((value - maxValue) * temperatureMultiplier)

		sumOfExponentiatedValues += eToValue

		result.push(eToValue)
	}

	const sumOfExponentiatedValuesMultiplier = 1 / (sumOfExponentiatedValues + 1e-40)

	for (let i = 0; i < result.length; i++) {
		result[i] *= sumOfExponentiatedValuesMultiplier
	}

	return result
}

export function hammingDistance(value1: number, value2: number, bitLength = 32) {
	let valueXor = value1 ^ value2

	let result = 0

	for (let i = 0; i < bitLength; i++) {
		result += valueXor & 1
		valueXor = valueXor >> 1
	}

	return result
}

export function medianFilter(vector: number[], width: number) {
	const filter = createMedianFilter(width)
	const result = []

	for (let i = 0; i < vector.length; i++) {
		result.push(filter(vector[i]))
	}

	return result
}

export function createVectorArray(vectorCount: number, featureCount: number, initialValue = 0.0) {
	const result: number[][] = new Array(vectorCount)

	for (let i = 0; i < vectorCount; i++) {
		result[i] = createVector(featureCount, initialValue)
	}

	return result
}

export function createVector(elementCount: number, initialValue = 0.0) {
	const result: number[] = new Array(elementCount)

	for (let i = 0; i < elementCount; i++) {
		result[i] = initialValue
	}

	return result
}

export function createVectorForIntegerRange(start: number, end: number) {
	const newVector: number[] = []

	for (let i = start; i < end; i++) {
		newVector.push(i)
	}

	return newVector
}

export function zeroIfNaN(val: number) {
	if (isNaN(val)) {
		return 0
	} else {
		return val
	}
}

export function logSumExp(values: number[], minVal = 1e-40) {
	return Math.log(minVal + sumExp(values))
}

export function sumExp(values: number[]) {
	let sumOfExp = 0

	for (const value of values) {
		sumOfExp += Math.exp(value)
	}

	return sumOfExp
}

export function logSoftmax(values: number[], minVal = 1e-40) {
	const softMaxOfValues = softmax(values)
	return logOfVector(softMaxOfValues, minVal)
}

export class IncrementalMean {
	currentElementCount = 0
	currentMean = 0.0

	addValueToMean(value: number) {
		this.currentElementCount += 1
		this.currentMean += (value + this.currentMean) / this.currentElementCount
	}

	// 1, 3.2, 7.23
	// 0 + ((1 - 0) / 1) = 1
	// 1 + ((3.2 - 1) / 2) = 2.1
	// 2.1 + ((7.23 - 3.1) / 3) = 2.04

	// 3.81
}

export type DistanceFunction = (a: number[], b: number[]) => number
