export type Language = 'en' | 'si' | 'ta';

export interface SourcedText {
  text: string;
  sources: string[];
}

export interface MaterialToolItem {
  item: string;
  spec_qty: string;
  type: 'material' | 'tool' | 'equipment' | 'document';
  sources: string[];
}

export interface HazardPpeItem {
  item: string;
  kind: 'hazard' | 'ppe';
  sources: string[];
}

export interface ProcedureStep {
  no: string;
  phase: string;
  action: string;
  details: string;
  caution: string;
  check: string;
  sources: string[];
}

export interface FlowchartNode {
  id: string;
  label: string;
  type: 'start' | 'step' | 'decision' | 'end';
}

export interface FlowchartEdge {
  from: string;
  to: string;
  label: string;
}

export interface FlowchartData {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}

export interface AnswerTable {
  title: string;
  headers: string[];
  rows: string[][];
  sources: string[];
}

export interface QualityCheckItem {
  check: string;
  criteria: string;
  sources: string[];
}

export interface AnswerReference {
  document: string;
  revision: string;
  chapter: string;
  pages: string;
  driveUrl?: string;
}

export interface StructuredAnswer {
  status: 'answered' | 'partially_covered' | 'not_covered';
  title: string;
  critical_warnings: SourcedText[];
  scope_summary: SourcedText | null;
  applies_to: SourcedText[];
  prerequisites: SourcedText[];
  materials_tools: MaterialToolItem[];
  hazards_ppe: HazardPpeItem[];
  steps: ProcedureStep[];
  flowchart: FlowchartData | null;
  tables: AnswerTable[];
  quality_checks: QualityCheckItem[];
  site_cleanup: SourcedText[];
  exit_handover: SourcedText[];
  records_reporting: SourcedText[];
  not_specified: string[];
  conflicts: string[];
  related_sops: string[];
  references: AnswerReference[];
}

export interface DebugChunkInfo {
  tag: string;
  id: string;
  docTitle: string;
  revision: string;
  chapter: string;
  section: string;
  pageStart: number;
  pageEnd: number;
  cosineScore: number;
  keywordBoost: number;
  combinedScore: number;
  isNeighbor: boolean;
  text: string;
}

export interface DebugPayload {
  query: string;
  expandedQuery: string;
  minScore: number;
  bestScore: number;
  aboveThreshold: boolean;
  docsIndexed: number;
  retrievedChunks: DebugChunkInfo[];
  rawModelOutput: string | null;
}

export type ChatStreamEvent =
  | { type: 'stage'; stage: 'searching' | 'writing' | 'done' }
  | { type: 'result'; answer: StructuredAnswer; debug?: DebugPayload }
  | { type: 'error'; error: string; code?: string };

export interface AppStatusResponse {
  appName: string;
  reportUrl: string;
  accessConfigured: boolean;
  docsCount: number;
  docs: Array<{
    docId: string;
    docTitle: string;
    revision: string;
    effectiveDate: string;
    pageCount: number;
    chunkCount: number;
  }>;
  minScore: number;
}

export interface SavedQA {
  id: string;
  question: string;
  language: Language;
  createdAt: string;
  answer: StructuredAnswer;
}
