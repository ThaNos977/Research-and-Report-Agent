/**
 * Comprehensive Evaluation Harness for Research & Documentation Assistant
 * Implements Section 9 benchmarks:
 * - Hybrid Retrieval (BM25 vs Dense vs Hybrid RRF: Recall@K, MRR)
 * - Deterministic Citation & Reference Parsing
 * - Meaning-Drift Guard Classification
 * - Reference Authenticity & Existence Checking
 * - Safe Math Calculator Verification (Functions, Percentages, No eval)
 * - Readability & Style Metrics
 */

import { MockDocumentAdapter } from '../host-mock/mockAdapter';
import { StructureAwareChunker } from '../core/nlp/chunker';
import { BM25Index } from '../core/nlp/bm25';
import { MockEmbedder } from '../core/nlp/embedder';
import { Word2VecEmbedder } from '../core/nlp/word2vec';
import { HybridRetriever } from '../core/nlp/retriever';
import { CitationParser } from '../core/nlp/citationParser';
import { MeaningDriftGuard } from '../core/nlp/driftGuard';
import { ReadabilityMetricsCalculator } from '../core/nlp/metrics';
import { SafeCalculator } from '../core/tools/calculator';
import {
  RETRIEVAL_EVAL_DATASET,
  DRIFT_EVAL_DATASET,
  REFERENCE_EVAL_DATASET,
} from './sampleDataset';

async function runEvaluationSuite() {
  console.log('========================================================================');
  console.log('  RESEARCH & DOCUMENTATION ASSISTANT — EVALUATION SUITE');
  console.log('========================================================================\n');

  const adapter = new MockDocumentAdapter();
  const paragraphs = await adapter.getParagraphs();
  const chunks = StructureAwareChunker.chunkDocument(paragraphs, { maxChunkSize: 800, overlap: 100 });

  const embedder = new MockEmbedder();
  for (const c of chunks) {
    c.embedding = await embedder.embed(c.text);
  }

  // ------------------------------------------------------------------------
  // 1. Retrieval Benchmark & Ablation (BM25 vs Dense vs Word2Vec vs Hybrid RRF)
  // ------------------------------------------------------------------------
  console.log('--- [1/6] Running Retrieval Benchmark & Ablation Study ---');

  const bm25 = new BM25Index();
  bm25.buildIndex(chunks);

  const word2vec = new Word2VecEmbedder();
  const w2vChunks = chunks.map((c) => ({ ...c }));
  for (const c of w2vChunks) {
    c.embedding = await word2vec.embed(c.text);
  }

  const hybrid = new HybridRetriever(word2vec);
  hybrid.setChunks(w2vChunks);

  let bm25Hits = 0;
  let denseHits = 0;
  let w2vHits = 0;
  let hybridHits = 0;
  let hybridReciprocalRanks = 0;

  const K = 3;

  for (const item of RETRIEVAL_EVAL_DATASET) {
    // 1. BM25 Search
    const bRes = bm25.search(item.query, K);
    const bMatches = bRes.some((r) => item.targetKeywords.some((kw) => r.chunk.text.includes(kw)));
    if (bMatches) bm25Hits++;

    // 2. Mock Dense Search
    const qVec = await embedder.embed(item.query);
    const dRes = chunks
      .map((c) => ({ chunk: c, score: embedder.cosineSimilarity(qVec, c.embedding!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, K);
    const dMatches = dRes.some((r) => item.targetKeywords.some((kw) => r.chunk.text.includes(kw)));
    if (dMatches) denseHits++;

    // 3. Word2Vec Local Centroid Search
    const w2vQVec = await word2vec.embed(item.query);
    const w2vRes = w2vChunks
      .map((c) => ({ chunk: c, score: word2vec.cosineSimilarity(w2vQVec, c.embedding!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, K);
    const w2vMatches = w2vRes.some((r) => item.targetKeywords.some((kw) => r.chunk.text.includes(kw)));
    if (w2vMatches) w2vHits++;

    // 4. Hybrid RRF Search (BM25 + Word2Vec)
    const hRes = await hybrid.retrieve(item.query, K);
    let rank = 0;
    for (let i = 0; i < hRes.length; i++) {
      if (item.targetKeywords.some((kw) => hRes[i].chunk.text.includes(kw))) {
        rank = i + 1;
        break;
      }
    }
    if (rank > 0) {
      hybridHits++;
      hybridReciprocalRanks += 1 / rank;
    }
  }

  const numQ = RETRIEVAL_EVAL_DATASET.length;
  const bm25Recall = ((bm25Hits / numQ) * 100).toFixed(1);
  const denseRecall = ((denseHits / numQ) * 100).toFixed(1);
  const w2vRecall = ((w2vHits / numQ) * 100).toFixed(1);
  const hybridRecall = ((hybridHits / numQ) * 100).toFixed(1);
  const mrr = (hybridReciprocalRanks / numQ).toFixed(3);

  console.table([
    { Method: 'Sparse BM25 Only', [`Recall@${K}`]: `${bm25Recall}%`, Hits: `${bm25Hits}/${numQ}` },
    { Method: 'Dense Embedding Only', [`Recall@${K}`]: `${denseRecall}%`, Hits: `${denseHits}/${numQ}` },
    { Method: 'Word2Vec Centroid Only (Local)', [`Recall@${K}`]: `${w2vRecall}%`, Hits: `${w2vHits}/${numQ}` },
    { Method: 'Hybrid RRF (BM25 + Word2Vec)', [`Recall@${K}`]: `${hybridRecall}%`, MRR: mrr, Hits: `${hybridHits}/${numQ}` },
  ]);

  // ------------------------------------------------------------------------
  // 2. Meaning Drift Guard Evaluation (Word2Vec)
  // ------------------------------------------------------------------------
  console.log('\n--- [2/6] Running Meaning-Drift Guard Classification (Word2Vec) ---');
  const driftGuard = new MeaningDriftGuard(word2vec, 0.80);
  let correctDriftClassifications = 0;

  for (const item of DRIFT_EVAL_DATASET) {
    const res = await driftGuard.checkDrift(item.original, item.replacement, 0.80);
    // If meaning preserved, warning should be false; if altered, warning should be true
    const predictedPreserved = !res.warning;
    if (predictedPreserved === item.isMeaningPreserved) {
      correctDriftClassifications++;
    }
  }

  const driftAccuracy = ((correctDriftClassifications / DRIFT_EVAL_DATASET.length) * 100).toFixed(1);
  console.log(`Meaning-Drift Guard Accuracy: ${driftAccuracy}% (${correctDriftClassifications}/${DRIFT_EVAL_DATASET.length})`);

  // ------------------------------------------------------------------------
  // 3. Citation & In-Text Reference Parser Test
  // ------------------------------------------------------------------------
  console.log('\n--- [3/6] Evaluating Citation & Reference Parser ---');
  const docText = adapter.getDocumentText();
  const parsedRefs = CitationParser.parseReferenceSection(docText);
  const inTextCitations = CitationParser.findInTextCitations(docText);
  const resolved = CitationParser.resolveInTextCitations(docText, parsedRefs);

  console.log(`Parsed References in Sample Paper: ${parsedRefs.length}`);
  console.log(`Identified In-Text Citations: ${inTextCitations.length}`);
  const hasRangeExpansion = inTextCitations.some((c) => c.keys.length > 1);
  console.log(`Citation Range Expansion ([4, 5] / [4-6]) functional: ${hasRangeExpansion ? 'PASS' : 'FAIL'}`);
  const hasResolvedLinks = resolved.some((r) => r.resolvedRefs && r.resolvedRefs.length > 0);
  console.log(`Bidirectional In-Text to Reference Resolution: ${hasResolvedLinks ? 'PASS' : 'FAIL'}`);

  // ------------------------------------------------------------------------
  // 4. Reference Existence & Authenticity Evaluation
  // ------------------------------------------------------------------------
  console.log('\n--- [4/6] Evaluating Reference Existence & Authenticity Pipeline ---');
  let refAuthCorrect = 0;
  for (const refItem of REFERENCE_EVAL_DATASET) {
    const authResult = CitationParser.verifyReferenceAuthenticity(refItem.rawEntry);
    if (authResult.isCorrupted === refItem.isCorrupted) {
      refAuthCorrect++;
    }
  }
  const refAuthAccuracy = ((refAuthCorrect / REFERENCE_EVAL_DATASET.length) * 100).toFixed(1);
  console.log(`Reference Authenticity Accuracy: ${refAuthAccuracy}% (${refAuthCorrect}/${REFERENCE_EVAL_DATASET.length})`);

  // ------------------------------------------------------------------------
  // 5. Safe Math Calculator Evaluation (Zero eval)
  // ------------------------------------------------------------------------
  console.log('\n--- [5/6] Evaluating Deterministic Math Engine (SafeCalculator) ---');
  const mathTests = [
    { expr: '100 * 1.05 ^ 5', expected: 127.628, tol: 0.01 },
    { expr: '(50 + 25) / 5', expected: 15, tol: 0.001 },
    { expr: '-10 + 20 * 2', expected: 30, tol: 0.001 },
    { expr: '1000 * 0.942 - 500 * 0.728', expected: 578, tol: 0.001 },
    { expr: 'sqrt(144) + abs(-25)', expected: 37, tol: 0.001 },
    { expr: 'round(94.2% * 1250)', expected: 1178, tol: 0.001 },
  ];

  let mathPassed = 0;
  for (const t of mathTests) {
    const res = SafeCalculator.evaluate(t.expr);
    const diff = Math.abs(res - t.expected);
    if (diff <= t.tol) {
      mathPassed++;
    } else {
      console.error(`Math test failed: "${t.expr}" = ${res}, expected ~${t.expected}`);
    }
  }
  console.log(`Safe Math Evaluation: ${mathPassed}/${mathTests.length} tests passed without eval.`);

  // ------------------------------------------------------------------------
  // 6. Readability & Style Metrics
  // ------------------------------------------------------------------------
  console.log('\n--- [6/6] Evaluating Deterministic Readability Metrics ---');
  // Use section 1 (Introduction) for realistic academic prose measurement
  const introSection = paragraphs.slice(5, 11).map((p) => p.text).join(' ');
  const metrics = ReadabilityMetricsCalculator.compute(introSection || docText);
  console.log(`Flesch Reading Ease: ${metrics.fleschReadingEase} / 100`);
  console.log(`Flesch-Kincaid Grade: ${metrics.fleschKincaidGrade}`);
  console.log(`Avg Sentence Length: ${metrics.avgSentenceLength} words`);
  console.log(`Passive Voice Rate: ${metrics.passiveVoicePercentage}%`);

  console.log('\n========================================================================');
  console.log('  EVALUATION SUITE COMPLETED SUCCESSFULLY');
  console.log('========================================================================\n');
}

// Execute if run via CLI
if (typeof process !== 'undefined' && process.argv[1]?.includes('evalRunner')) {
  runEvaluationSuite().catch((err) => {
    console.error('Evaluation run failed:', err);
    process.exit(1);
  });
}

export { runEvaluationSuite };
