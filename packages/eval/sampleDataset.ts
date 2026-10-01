export interface RetrievalEvalItem {
  id: string;
  query: string;
  targetKeywords: string[];
}

export interface ClaimEvalItem {
  id: string;
  claim: string;
  expectedVerdict: 'supported' | 'contradicted' | 'unverifiable';
}

export interface RefExistenceEvalItem {
  rawEntry: string;
  isCorrupted: boolean;
}

export interface DriftEvalItem {
  original: string;
  replacement: string;
  isMeaningPreserved: boolean;
}

export const RETRIEVAL_EVAL_DATASET: RetrievalEvalItem[] = [
  {
    id: 'ret_1',
    query: 'What was the factual verification accuracy achieved by the multi-agent framework?',
    targetKeywords: ['94.2%', '72.8%', 'accuracy', 'benchmark'],
  },
  {
    id: 'ret_2',
    query: 'Who demonstrated that self-attention allows deep contextualization across long sequences?',
    targetKeywords: ['Vaswani', '2017', 'self-attention'],
  },
  {
    id: 'ret_3',
    query: 'What are the three synchronized modules of the NeuroSymbolic-Agent architecture?',
    targetKeywords: ['Dynamic Task Decomposer', 'Hybrid Retrieval Core', 'Deterministic Constraint Engine'],
  },
  {
    id: 'ret_4',
    query: 'What was the MRR score of the proposed Hybrid RRF retrieval method?',
    targetKeywords: ['0.86', 'Hybrid RRF', 'MRR', '92.6%'],
  },
  {
    id: 'ret_5',
    query: 'Why did classical artificial intelligence fail to generalize in scientific empirical research?',
    targetKeywords: ['rule-based', 'rigid', 'inference engines', 'generalizability'],
  },
];

export const CLAIM_EVAL_DATASET: ClaimEvalItem[] = [
  {
    id: 'claim_1',
    claim: 'The speed of light in a vacuum is approximately 299,792 kilometers per second.',
    expectedVerdict: 'supported',
  },
  {
    id: 'claim_2',
    claim: 'Penicillin was discovered by Alexander Fleming in 1928.',
    expectedVerdict: 'supported',
  },
  {
    id: 'claim_3',
    claim: 'The human genome contains exactly 400 billion base pairs.',
    expectedVerdict: 'contradicted',
  },
  {
    id: 'claim_4',
    claim: 'Albert Einstein was awarded the Nobel Prize in Physics for developing the general theory of relativity.',
    expectedVerdict: 'contradicted', // Actually awarded for the photoelectric effect
  },
  {
    id: 'claim_5',
    claim: 'Alien civilizations constructed subterranean silicate structures on Mars in 1420 BCE.',
    expectedVerdict: 'unverifiable',
  },
];

export const REFERENCE_EVAL_DATASET: RefExistenceEvalItem[] = [
  {
    rawEntry: '[1] Russell, S., & Norvig, P. (2020). Artificial Intelligence: A Modern Approach (4th ed.). Pearson.',
    isCorrupted: false,
  },
  {
    rawEntry: '[2] Vaswani, A., et al. (2017). Attention is all you need. Advances in Neural Information Processing Systems.',
    isCorrupted: false,
  },
  {
    rawEntry: '[3] Thorne, J., et al. (2018). FEVER: a large-scale dataset for fact extraction and verification. NAACL.',
    isCorrupted: false,
  },
  {
    rawEntry: '[4] InventedAuthor, X. (1842). Hyperdimensional Quantum Teleportation in Martian Soil. Journal of Fictional Studies.',
    isCorrupted: true,
  },
  {
    rawEntry: '[5] Nonexistent, Z., & Fake, Q. (2099). Subatomic Telepathy and Antigravity Drives. Galactic Review.',
    isCorrupted: true,
  },
];

export const DRIFT_EVAL_DATASET: DriftEvalItem[] = [
  {
    original: 'Our multi-agent framework achieved a 94.2% factual verification accuracy.',
    replacement: 'The proposed multi-agent system demonstrated a 94.2% accuracy in verifying factual claims.',
    isMeaningPreserved: true,
  },
  {
    original: 'Classical artificial intelligence relied on rigid, rule-based inference engines.',
    replacement: 'Traditional AI methods depended heavily upon deterministic rule-based reasoning architectures.',
    isMeaningPreserved: true,
  },
  {
    original: 'The hybrid retrieval mechanism demonstrated marked superiority over standalone dense and sparse baselines.',
    replacement: 'The hybrid search method proved completely ineffective and significantly underperformed baseline techniques.',
    isMeaningPreserved: false, // Inverted meaning!
  },
  {
    original: 'We evaluated the framework across three primary benchmark metrics.',
    replacement: 'The experiment was terminated immediately due to hardware malfunctions.',
    isMeaningPreserved: false, // Totally altered meaning!
  },
];
