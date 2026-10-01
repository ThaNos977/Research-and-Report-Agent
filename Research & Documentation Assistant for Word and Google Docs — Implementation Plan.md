# Research & Documentation Assistant for Word and Google Docs — Implementation Plan

Oct 1, 2026 · @Deven

The project changes from a standalone page that researches a topic from scratch into a side-panel assistant that runs inside Word and Google Docs and works on the paper the user already has open.

## 1. Scope and locked decisions

| Decision | Your answer | Consequence |
| --- | --- | --- |
| Host | Word / Google Docs add-in | One shared core, two thin adapters: Office.js for Word, Apps Script for Docs |
| Model access | User brings own Gemini key | No server. Key lives in per-user storage, never in the document. Rate limits are the user's own quota |
| Features | Claim and citation check, section feedback and rewrite, paper Q&A, documentation assist | Task skills in section 4; documentation assist is not yet defined (section 12) |
| NLP depth | Hybrid: embeddings + LLM | Own chunking, embedding, retrieval and evaluation (sections 6 and 9) |

Nothing beyond these four answers is assumed. Anything they leave open is listed as a question in section 12.

## 2. What carries over from the current code, and what must change

The ReAct loop, the three tools and the step-streaming UI carry over; the single topic-to-report job, the key handling and the browser-only features do not. This table is based only on your architecture document, so anything about file internals it does not state is marked as unknown.

| Existing piece | Fate | Reason |
| --- | --- | --- |
| `ResearchAgent` ReAct loop in `agentService.ts` (max 10 iterations, corrective reminder if `generate_report` is skipped) | Keep the pattern. Move to `core`, and make it run any *skill* with its own tool set, iteration cap and output tool | Today the loop has one job: topic in, `ResearchReport` out |
| Native `googleSearch` tool | Keep. Read the API's grounding metadata for evidence | In the current design `sources` are filled in by the model inside the `generate_report` arguments. The document lists no step that reads grounding metadata, so source URLs are model-written text. Claim checking needs URLs that come from the API response |
| `calculate` tool | Keep, for numeric consistency checks in the paper. Replace the evaluator if it uses `eval` or `Function` | The document says only that a regex strips non-math characters and the expression is evaluated; how is not stated |
| `generate_report` and `ResearchReport` | Keep as the *Research brief* skill. Its output is inserted into the document | Preserves the existing feature |
| `askFollowUp` | Becomes the starting point of the *Ask paper* skill, grounded on retrieved chunks instead of the whole report | It puts title, summary, sections and calculations into the system instruction. A full paper does not fit that approach without retrieval |
| `App.tsx` dashboard (progress bar, step log, JSON viewer, report viewer) | Split into task-pane components, laid out for a narrow side panel | Same information, different container |
| `App.tsx` Project Details tab | Move to repo documentation. Do not ship in the add-in | It is academic documentation, not a user feature |
| Share link (`?reportId=`), `window.print` PDF export | Drop inside the add-in | A task pane has no shareable URL, and the document itself is the output |
| `localStorage` history | Replace with a `Storage` interface (section 8) | Each host stores data differently |
| Recharts `chartData` | Keep for the Research brief only | The other skills produce no charts |
| `process.env.GEMINI_API_KEY` via Vite `loadEnv` | Remove from anything shipped | If `vite.config.ts` inlines it with `define`, it is readable in the built bundle. I have not seen that file |
| `gemini-3-flash-preview` | Make the model ID a setting | A preview model ID is not guaranteed to stay available |
| React 19, Tailwind v4, Motion, Lucide, Vite 6 | Keep | Word needs an HTTPS dev server; Docs needs a single-file HTML bundle (section 5) |

## 3. Target architecture and repo layout

&#91;embedded content: architecture · UI, core, adapter, 3 hosts, Gemini API\]

The core holds the agent, the NLP pipeline and the skills; each host contributes only its adapter and its packaging. The Gemini API is called straight from the user's browser context with their own key, so there is no server to run.

Proposed layout, as npm workspaces:

```text
packages/
  core/            no Office or Apps Script imports
    llm/           Gemini client, retry and backoff, grounding-metadata parser
    agent/         ReAct loop, skill runner, step events (from agentService.ts)
    skills/        checkClaims, reviewSection, askPaper, researchBrief, docsAssist
    tools/         searchDocument, readSection, proposeEdit, calculate, search
    nlp/           chunker, bm25, embedder, retriever, citationParser, metrics
    storage/       Storage interface and in-memory / IndexedDB versions
    types.ts
  ui/              React task pane (from App.tsx)
  host-word/       Office.js adapter and manifest
  host-gdocs/      Apps Script server code and sidebar bundle
  host-mock/       in-memory document adapter for tests and evaluation
  eval/            datasets, runners, metrics scripts
```

## 4. Agent redesign: skills, tools, data types

The single research agent becomes a skill runner. A skill is a prompt, a tool subset, an iteration cap and a typed output. The user picks the skill with a button or menu; the chat box defaults to Ask paper. There is no LLM router in the first version, so no routing errors to debug.

| Skill | Input | Tools | Typed output |
| --- | --- | --- | --- |
| Check claims | Selection, section or whole document | `searchDocument`, `googleSearch`, `calculate` | `ClaimFinding[]` |
| Review section | Selection or section | `getOutline`, `readSection`, `calculate` | `Suggestion[]` |
| Ask paper | A question typed in chat | `searchDocument`, `readSection`, optional `googleSearch` | Answer with chunk IDs |
| Documentation assist | Not yet defined (section 12) | To be decided | To be decided |
| Research brief (existing) | A topic | `googleSearch`, `calculate`, `generate_report` | `ResearchReport`, inserted at the cursor |

**New tools.** `getOutline()` returns the heading tree. `readSection(headingPath)` returns that section's text. `searchDocument(query, k)` runs hybrid retrieval (section 6). `proposeEdit(...)` records a `Suggestion` and does not touch the document.

**Hard rule: no tool writes to the document.** Only the user's click on Apply does, through the adapter. Document text and web results are untrusted input, so an instruction hidden inside a paper must not be able to cause an edit.

**Two-stage calls.** Search grounding and structured output are kept in separate model calls: a grounded call returns text plus grounding metadata, then a second call without search turns that into the typed output. The current code puts search and function declarations in one request. Whether that works on `gemini-3-flash-preview` is verified in Phase 0 (section 11); the two-stage pattern works either way.

**Types** (extending `types.ts`; `AgentStep` gains a `skill` field and a `proposal` step type):

```ts
type Locator = {
  host: 'word' | 'gdocs' | 'mock';
  paragraphIndex: number;   // hint only, shifts when the user edits
  startsWith: string;       // first ~40 characters, used to re-find the text
  contextHash: string;      // hash of the paragraph at index time
  namedRangeId?: string;    // Docs only: survives edits
};

interface DocChunk {
  id: string; text: string; headingPath: string[];
  locator: Locator; contentHash: string; embedding?: Float32Array;
}

interface Suggestion {
  id: string; locator: Locator; original: string; replacement: string;
  rationale: string;
  category: 'clarity' | 'tone' | 'structure' | 'grammar' | 'terminology';
  status: 'proposed' | 'applied' | 'dismissed' | 'stale';
}

interface ClaimFinding {
  id: string; claimText: string; locator: Locator; citationKeys: string[];
  verdict: 'supported' | 'contradicted' | 'unverifiable' | 'reference_not_found';
  evidence: { title: string; url: string; snippet: string }[]; // from grounding metadata only
}
```

The `Locator` design exists because neither host gives offsets that survive edits. Before any highlight or apply, the adapter re-finds the text using `startsWith` and `contextHash`. If it cannot find it exactly once, the suggestion becomes `stale` and is never applied.

## 5. Host adapters for Word and Google Docs

The core talks to the document only through one interface, so the two hosts differ in one package each. Every host claim below comes from my knowledge of the Office.js and Apps Script APIs, not from your code, and each is checked in Phase 0.

```ts
interface DocumentAdapter {
  capabilities: { trackedChanges: boolean; anchoredComments: boolean; selectionEvents: boolean };
  getDocumentId(): Promise<string>;
  getOutline(): Promise<Heading[]>;
  getParagraphs(): Promise<ParagraphInfo[]>;     // text, style, index
  getSelection(): Promise<SelectedText | null>;
  locate(l: Locator): Promise<ResolvedRange | null>;  // re-anchor after edits
  highlight(l: Locator): Promise<void>;
  applySuggestion(s: Suggestion, mode: 'tracked' | 'direct'): Promise<ApplyResult>;
  insertAtCursor(content: RichContent): Promise<void>;
}
```

| Concern | Word (Office.js) | Google Docs (Apps Script) |
| --- | --- | --- |
| Runs as | Task pane served over HTTPS; sideloaded through a manifest during development | Sidebar from `HtmlService`, built as one HTML file with Vite and pushed with `clasp` |
| Read text and structure | `Word.run`, `body.paragraphs`, paragraph style for headings | `DocumentApp.getActiveDocument().getBody()`, paragraph heading attribute |
| Selection | `getSelection()`; change event through `Office.EventType.DocumentSelectionChanged` | `getSelection()`; no event, so a "Use selection" button |
| Re-find text | `body.search`, documented limit of 255 characters per search string, so search the first 255 and extend | `findText` takes a regex, so user text must be escaped; `addNamedRange` keeps a handle that follows edits |
| Apply an edit | Set `changeTrackingMode` to track all, then replace the range: native tracked change, user accepts or rejects in Word | No tracked-change API in `DocumentApp` as far as I know, so direct edit after an explicit confirm |
| Comments | `range.insertComment` (WordApi 1.4) | Not in the first version: anchored comments go through the Drive API and are unreliable |
| Where the key is stored | `OfficeRuntime.storage` | `PropertiesService.getUserProperties()` |
| Core to host calls | Direct, same JavaScript context | Async RPC with `google.script.run`; payloads are chunked |

**Capability flags drive the UI.** Where `trackedChanges` is false, Apply shows a diff and asks for confirmation. Where `selectionEvents` is false, the selection button is shown.

**Do not use `Office.context.document.settings` for anything private.** It is stored inside the document and travels with the file.

**Mock adapter.** `host-mock` implements the same interface over an in-memory markdown document. All skills, tests and the evaluation harness run against it, so most work needs neither Word nor Docs open.

## 6. NLP pipeline: chunking, hybrid retrieval, deterministic parsing

This is the part that makes the project an NLP project rather than a wrapper around one model call. Everything here lives in `core/nlp` with no model dependency except the embedder, so it can be unit-tested and evaluated alone.

1. **Structure-aware chunking.** Split at headings first, then at paragraphs, then merge neighbours up to a size budget with optional overlap. Each chunk keeps its `headingPath` and `Locator`. Size and overlap are parameters, because they are ablated in section 9.
2. **Dense retrieval.** An `Embedder` interface with a Gemini embedding implementation that uses the user's key. Chunks are embedded once and cached by `contentHash`, so an edit re-embeds only the changed chunks. Queries and documents use different task types if the chosen model supports them (verify the model ID and this option in Phase 0).
3. **Sparse retrieval.** BM25 written in TypeScript. Tokenisation keeps numbers and citation keys, which matter in papers and which embeddings blur.
4. **Fusion.** Reciprocal rank fusion of the dense and BM25 rankings. Brute-force cosine similarity over the chunk matrix is enough at paper scale; measure it in Phase 0 instead of adding a vector database.
5. **Answer grounding.** The model must cite chunk IDs. A deterministic post-check rejects any cited ID that was not retrieved. If the best retrieval score is below a threshold, the answer is "not found in the document" and the model is not asked to guess.
6. **Citation parser (no model).** Detects the References section, splits entries, extracts authors, year and title with rules, and maps in-text markers (`[3]`, `[2–5]`, `(Author et al., 2021)`) to entries. A model is used only for entries the rules cannot parse.
7. **Readability and style metrics (no model).** Sentence length, passive-voice rate and Flesch score per section, computed locally and passed to the review prompt, so feedback can quote measured numbers.
8. **Meaning-drift guard.** Cosine similarity between a suggestion's `original` and `replacement` embeddings. Below a tuned threshold the suggestion is flagged "may change meaning" before the user sees Apply.

Indexes are in memory per session, and are persisted to IndexedDB where the host allows it (section 8).

## 7. Feature specs

### Claim and citation check

The check separates what can be decided by rules from what needs search and a model, and it reports "unverifiable" rather than guessing.

1. Parse in-text citations and the reference list with the rule-based parser (section 6).
2. Reference existence: for each entry, run a grounded search on title, authors and year. If no grounding source matches the entry by fuzzy title comparison, mark `reference_not_found`. The match threshold is tuned in evaluation.
3. Claim extraction: a structured-output call over the selected text returns check-worthy claims, each with its attached citation keys. Uncited check-worthy claims are listed separately.
4. Support check: for cited claims, a grounded call compares the claim with what the located source says. Evidence snippets and URLs come from grounding metadata, never from model text.
5. Numeric consistency: numbers quoted in prose are compared with the document's own tables through `calculate` (sums, percentages, counts).

Known limit: in a browser, the add-in cannot download and read the full text of a cited paper, so step 4 rests on what search grounding returns. Whether to add scholarly metadata APIs is open question 4.

### Section feedback and rewrite

- Input is the selection or the current heading's section.
- Output is a list of `Suggestion`s in five categories: clarity, tone, structure, grammar, terminology.
- A suggestion is shown only if its `original` text is found verbatim in the document, so the model cannot comment on text that is not there.
- Each suggestion passes the meaning-drift guard first.
- Apply: Word makes a tracked change; Docs makes a direct edit after a diff and a confirm.

### Paper Q&A

- On open, the add-in indexes the document with a progress bar and rebuilds only changed chunks afterwards.
- A question runs hybrid retrieval, then an answer with chunk citations. Clicking a citation scrolls to and highlights the paragraph.
- Below the retrieval threshold the answer is "not found in the document".
- A toggle allows web search. Answers then label each statement as document or web.

### Documentation assist

Your brief names this feature without defining it, so this subsection stays a placeholder until question 1 in section 12 is answered. Candidate behaviours that fit the existing architecture: a structure check against a chosen template (for example Overview, Install, Usage, API), terminology and acronym consistency (acronyms defined at first use, variant spellings of one term), and inserting a generated abstract or table of contents.

## 8. Key handling, storage, privacy, security

The user's key and the user's paper are the two sensitive things here, and the design keeps both out of places they could leak.

| Item | Word | Google Docs | Mock / tests |
| --- | --- | --- | --- |
| Gemini key | `OfficeRuntime.storage` | `PropertiesService.getUserProperties()` | In-memory test key |
| Settings (model ID, chunk size, thresholds) | `OfficeRuntime.storage` | `PropertiesService.getUserProperties()` | In-memory |
| Embedding index cache | IndexedDB if the pane allows it, else in-memory | Same; whether the sidebar sandbox allows IndexedDB is a Phase 0 check | In-memory |
| Research brief history | Same storage as settings | Same | In-memory |

**Rules**

- The key is never written into the document, its properties or its settings, never logged, never placed in a URL.
- Document text goes to Google through the user's key. A first-run notice says so. Google's Gemini API terms treat free and paid usage differently, so the notice must link the terms current at build time.
- Default scope is the selection or section. Indexing the whole document is an explicit action.
- Document text and search results are data. The system prompt says so, and no tool can edit the document (section 4).
- Model output is rendered through a markdown sanitiser, never as raw HTML.
- `calculate` uses a small arithmetic parser, not `eval`.
- Requests that return 429 retry with backoff, and embedding batches have a concurrency cap. The quota error is shown to the user as it is.
- No telemetry is planned in the first version.

## 9. Evaluation plan

Every NLP component gets a metric and at least one ablation, run through `eval/` against the mock adapter with model responses cached, so reruns are cheap and repeatable. Dataset names are real public datasets that I have not checked for access or licence; confirm both before relying on them.

| Component | Data | Metric | Ablation |
| --- | --- | --- | --- |
| Retrieval | QASPER (questions over NLP papers with evidence annotations), plus a few papers you annotate yourselves | recall@k, MRR | BM25 only vs dense only vs hybrid; chunk size; overlap |
| Answer grounding | Fixed labelled sample of Q&A outputs | Share of answers whose cited chunks contain the stated fact | Threshold for "not found" |
| Claim verification | SciFact (scientific claims with supporting or refuting abstracts) | Accuracy and macro-F1 over supported, contradicted, not enough info | Model alone vs model plus grounding |
| Reference existence | Real reference lists from open papers, with a fraction deliberately corrupted (swapped year, replaced authors, invented title) | Precision and recall of `reference_not_found` | Fuzzy-match threshold |
| Meaning-drift guard | Original and rewrite pairs that you label meaning-preserved or not | ROC curve for the cosine threshold | Embedding model |
| Section feedback | Blind A/B on a small set of sections, human rubric | Mean rubric score | With vs without the computed readability metrics in the prompt |
| Cost and latency | All skills | p50 and p95 time, tokens per run | Two-stage vs single call |

SciFact supplies the evidence abstracts, while the add-in finds evidence through live search, so the SciFact run tests the verifier with evidence given, not search quality. Search quality is covered by the reference-existence experiment. Model-as-judge is not used as the only metric for any row.

## 10. Phases with acceptance criteria

&#91;embedded content: roadmap · 7 phases, 7 gates, Phase 5 optional\]

Phases are ordered by dependency, not by calendar, because team size and date are unknown (question 6).

- **Phase 0, spikes.** The six items in section 11, each as a throwaway script, plus a timed brute-force cosine search over the chunks of one real paper.
- **Phase 1, core extraction.** Create the workspaces. Move the loop and tools out of `agentService.ts`. Add the skill runner, the `Storage` and `DocumentAdapter` interfaces and the mock host. Remove the build-time key. Replace the calculator evaluator. Port the dashboard components to `ui`. Research brief keeps working throughout.
- **Phase 2, NLP core.** Chunker, BM25, embedder, rank fusion, citation parser, readability metrics. Retrieval runs in `eval/` with the ablations from section 9. Unit tests with fixture papers.
- **Phase 3, Word add-in.** Manifest and HTTPS dev setup. Adapter. Settings pane for the key. Ask paper and Review section end to end, with tracked-change apply and locator re-anchoring tests.
- **Phase 4, claim and citation check.** Reference-existence pipeline, claim extraction, support check from grounding metadata, numeric consistency. A findings list that highlights the text in the document. The two evaluations from section 9.
- **Phase 5, Google Docs.** Apps Script project, single-file sidebar bundle, adapter with named ranges, selection button, confirm-before-apply flow. Contract tests shared with the Word adapter.
- **Phase 6, wrap-up.** Documentation assist once defined. Meaning-drift guard curve. Final evaluation report. A demo document and a walkthrough.

## 11. Risks and Phase-0 spikes

Six things in this plan rest on API behaviour I could not verify from your documents, so each gets a short spike before design is frozen.

| # | Unknown | Why it matters | Spike and fallback |
| --- | --- | --- | --- |
| 1 | Whether `googleSearch` and function declarations can be combined in one request on `gemini-3-flash-preview` | The current loop assumes it | Send one such request and log the raw response. If it fails, use the two-stage pattern (section 4) |
| 2 | Shape of grounding metadata in the current `@google/genai` response | Claim evidence must come from it | Log a raw grounded response and write the parser against it |
| 3 | A task pane (Word) and a sidebar (Docs) calling the Gemini API directly with the user's key | The no-server design depends on it | One `fetch` from each host. If the Docs sandbox blocks it, route the call through Apps Script `UrlFetchApp` |
| 4 | IndexedDB and storage behaviour inside both panes | Index caching and key storage | Write, reload, read back. Fall back to in-memory indexes |
| 5 | Word API requirement set on the Word versions you target | Tracked changes and comments need WordApi 1.4 | Run the adapter on each target Word. Question 5 in section 12 |
| 6 | Embedding model ID, task types and free-tier rate limit | Sets indexing time for a long paper | Embed a real paper end to end and time it |

**Other risks**

- Locator drift after the user edits. Mitigation: re-find before every highlight or apply, and mark `stale` when not found exactly once.
- Claim check cannot read cited full text, so many claims will be `unverifiable`. The interface says so plainly instead of guessing.
- Preview model IDs can be retired. The model ID is a setting.
- Two hosts double the testing surface. Mitigation: shared contract tests that run against the mock, Word and Docs adapters.
- Scope. Google Docs support is the largest optional block and can be cut without breaking the Word path (Phase 5).

## 12. Open questions for you

Questions 1 to 4 change what gets built; 5 to 8 change the order and size of the work. Reply in a comment or in chat.

1. **What should "documentation assist" do?** Technical documentation (README, API docs, runbooks), project reports, or the structure and consistency of the research paper itself? The candidates in section 7 are mine, not yours.
2. **Are Word and Google Docs both required, or is one primary?** If Word is primary, Phase 5 becomes a stretch goal.
3. **Where should embeddings be computed?** The Gemini embedding API with the user's key (simple, needs network), a model running in the browser (private and offline, but a large first download and slower indexing), or both so they can be compared in evaluation.
4. **May the claim checker call scholarly metadata APIs** (for example Crossref or Semantic Scholar) in addition to Google Search grounding? It improves reference checks but adds dependencies and a browser-access check for each.
5. **Which Word do you target?** Desktop on Windows or Mac, Word on the web, or all, and the oldest version that must work.
6. **How many people are building this, and what is the submission or demo date?** Phases below are sized relatively because I do not know either.
7. **Must the current standalone web app keep working unchanged?** It satisfies a written specification you may still be graded on. If yes, the refactor keeps it as a thin app over `core`.
8. **Which citation styles must the parser handle?** Numeric, author-year, or IEEE and APA specifically.
