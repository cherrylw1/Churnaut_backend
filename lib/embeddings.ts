export const EMBEDDING_DIMENSIONS = 1024

export function assertEmbeddingVector(vector: unknown, label = 'embedding'): asserts vector is number[] {
  if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS || vector.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`${label} must contain exactly ${EMBEDDING_DIMENSIONS} finite numeric values`)
  }
}
