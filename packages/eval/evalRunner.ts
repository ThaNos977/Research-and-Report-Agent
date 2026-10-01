/**
 * Comprehensive Evaluation Harness for Research & Documentation Assistant
 * Implements Section 9 benchmarks:
 * - Hybrid Retrieval (BM25 vs Dense vs Hybrid RRF: Recall@K, MRR)
 * - Deterministic Citation & Reference Parsing
 * - Meaning-Drift Guard Classification
 * - Readability & Style Metrics
 * - Safe Math Calculator Verification
 */

import { MockDocumentAdapter } from '../host-mock/mockAdapter';
import { StructureAwareChunker } from '../core/nlp/chunker';
import { BM25Index } from '../core/nlp/bm25';
import { MockEmbedder } from '../core/nlp/embedder';
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
  // 1. Retrieval Benchmark & Ablation (BM25 vs Dense vs Hybrid RRF)
  // ------------------------------------------------------------------------
  console.log('--- [1/5] Running Retrieval Benchmark & Ablation Study ---');

  const bm25 = new BM25Index();
  bm25.buildIndex(chunks);

  const hybrid = new HybridRetriever(embedder);
  hybrid.setChunks(chunks);

  let bm25Hits = 0;
  let denseHits = 0;
  let hybridHits = 0;
  let hybridReciprocalRanks = 0;

  const K = 3;

  for (const item of RETRIEVAL_EVAL_DATASET) {
    // 1. BM25 Search
    const bRes = bm25.search(item.query, K);
    const bMatches = bRes.some((r) => item.targetKeywords.some((kw) => r.chunk.text.includes(kw)));
    if (bMatches) bm25Hits++;

    // 2. Dense Search
    const qVec = await embedder.embed(item.query);
    const dRes = chunks
      .map((c) => ({ chunk: c, score: embedder.cosineSimilarity(qVec, c.embedding!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, K);
    const dMatches = dRes.some((r) => item.targetKeywords.some((kw) => r.chunk.text.includes(kw)));
    if (dMatches) denseHits++;

    // 3. Hybrid RRF Search
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
  const hybridRecall = ((hybridHits / numQ) * 100).toFixed(1);
  const mrr = (hybridReciprocalRanks / numQ).toFixed(3);

  console.table([
    { Method: 'Sparse BM25 Only', [`Recall@${K}`]: `${bm25Recall}%`, Hits: `${bm25Hits}/${numQ}` },
    { Method: 'Dense Embedding Only', [`Recall@${K}`]: `${denseRecall}%`, Hits: `${denseHits}/${numQ}` },
    { Method: 'Hybrid RRF (Proposed)', [`Recall@${K}`]: `${hybridRecall}%`, MRR: mrr, Hits: `${hybridHits}/${numQ}` },
  ]);

  // ------------------------------------------------------------------------
  // 2. Meaning Drift Guard Evaluation
  // ------------------------------------------------------------------------
  console.log('\n--- [2/5] Running Meaning-Drift Guard Classification ---');
  const driftGuard = new MeaningDriftGuard(embedder, 0.80);
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
  console.log('\n--- [3/5] Evaluating Citation & Reference Parser ---');
  const docText = adapter.getDocumentText();
  const parsedRefs = CitationParser.parseReferenceSection(docText);
  const inTextCitations = CitationParser.findInTextCitations(docText);

  console.log(`Parsed References in Sample Paper: ${parsedRefs.length}`);
  console.log(`Identified In-Text Citations: ${inTextCitations.length}`);
  const hasRangeExpansion = inTextCitations.some((c) => c.keys.length > 1);
  console.log(`Citation Range Expansion ([4, 5] / [4-6]) functional: ${hasRangeExpansion ? 'PASS' : 'FAIL'}`);

  // ------------------------------------------------------------------------
  // 4. Safe Math Calculator Evaluation (Zero eval)
  // ------------------------------------------------------------------------
  console.log('\n--- [4/5] Evaluating Deterministic Math Engine (SafeCalculator) ---');
  const mathTests = [
    { expr: '100 * 1.05 ^ 5', expected: 127.628, tol: 0.01 },
    { expr: '(50 + 25) / 5', expected: 15, tol: 0.001 },
    { expr: '-10 + 20 * 2', expected: 30, tol: 0.001 },
    { expr: '1000 * 0.942 - 500 * 0.728', expected: 578, tol: 0.001 },
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
  // 5. Readability & Style Metrics
  // ------------------------------------------------------------------------
  console.log('\n--- [5/5] Evaluating Deterministic Readability Metrics ---');
  const sampleSection = paragraphs.slice(0, 3).map((p) => p.text).join(' ');
  const metrics = ReadabilityMetricsCalculator.compute(sampleSection);
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
