export type DuplicateClassification = "unique" | "suspected_duplicate" | "exact_duplicate";

export interface DuplicateSignalInput {
  sameDocumentChecksum?: boolean;
  sameProviderRecordId?: boolean;
  sameBusinessKey?: boolean;
  fuzzySimilarityScore?: number;
}

export interface DuplicateDetectionResult {
  classification: DuplicateClassification;
  reasons: string[];
  matchedEntityIds: string[];
}

export type ReviewQueue = "ingestion_review" | "duplicate_review" | "matching_review";

export interface ReviewDecision {
  queue: ReviewQueue;
  reasons: string[];
  blocking: boolean;
}
