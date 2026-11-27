export interface UIStrings {
  appNameFallback: string;
  tagline: string;
  navChat: string;
  navDebug: string;
  historyButton: string;
  historyTitle: string;
  historyEmpty: string;
  historyOfflineNote: string;
  clearHistory: string;
  installButton: string;
  installIosButton: string;
  installIosTitle: string;
  installIosStep1: string;
  installIosStep2: string;
  close: string;
  offlineBanner: string;
  noDocsNotice: string;
  askPlaceholder: string;
  send: string;
  micStart: string;
  micStop: string;
  searchingStage: string;
  writingStage: string;
  examplesLabel: string;
  examples: string[];
  quickView: string;
  fullView: string;
  copy: string;
  copied: string;
  share: string;
  reportProblem: string;
  statusAnswered: string;
  statusPartial: string;
  statusNotCovered: string;
  stepsCompleted: string;
  resetChecklist: string;
  sections: {
    criticalWarnings: string;
    scopeSummary: string;
    appliesTo: string;
    prerequisites: string;
    materialsTools: string;
    hazardsPpe: string;
    steps: string;
    flowchart: string;
    tables: string;
    qualityChecks: string;
    siteCleanup: string;
    exitHandover: string;
    recordsReporting: string;
    notSpecified: string;
    conflicts: string;
    relatedSops: string;
    references: string;
  };
  tableCols: {
    item: string;
    specQty: string;
    type: string;
    check: string;
    criteria: string;
  };
  stepLabels: {
    caution: string;
    verify: string;
  };
  accessGate: {
    title: string;
    subtitle: string;
    placeholder: string;
    submit: string;
    checking: string;
    invalid: string;
    notConfigured: string;
    rememberNote: string;
    signOut: string;
  };
  debug: {
    title: string;
    subtitle: string;
    queryLabel: string;
    minScoreLabel: string;
    runTest: string;
    indexedDocs: string;
    bestScore: string;
    threshold: string;
    aboveThreshold: string;
    belowThreshold: string;
    retrievedChunks: string;
    rawOutput: string;
    neighborTag: string;
    backToChat: string;
  };
  errorGeneric: string;
}

export const en: UIStrings = {
  appNameFallback: 'SOP Assistant',
  tagline: 'Ask about telecom installation procedures using only approved SOP documents.',
  navChat: 'Ask SOP',
  navDebug: 'Debug',
  historyButton: 'Saved',
  historyTitle: 'Saved Offline Answers',
  historyEmpty: 'Your last 20 Q&As are saved automatically on this device for offline field use.',
  historyOfflineNote: 'Available offline',
  clearHistory: 'Clear saved',
  installButton: 'Install App',
  installIosButton: 'Add to Home',
  installIosTitle: 'Install on iPhone / iPad',
  installIosStep1: 'Tap the Share button at the bottom of Safari.',
  installIosStep2: 'Scroll down and tap "Add to Home Screen".',
  close: 'Close',
  offlineBanner: 'Offline — showing saved Q&As only. Connect to ask new questions.',
  noDocsNotice: 'No active SOP PDFs are indexed yet. Upload PDFs to /sops in GitHub to enable search.',
  askPlaceholder: 'Ask a procedure question (English, සිංහල, தமிழ்)...',
  send: 'Ask',
  micStart: 'Speak question',
  micStop: 'Stop listening',
  searchingStage: 'Searching approved SOP documents...',
  writingStage: 'Structuring field procedure...',
  examplesLabel: 'Common field questions',
  examples: [
    'What are the FTTH drop cable termination and bending radius rules?',
    'How do I test a fiber link with an OTDR and what loss limits apply?',
    'What PPE and earthing checks are required before ODF installation?',
    'How should a dome splice closure be sealed and tested?',
  ],
  quickView: 'Quick view',
  fullView: 'Full view',
  copy: 'Copy',
  copied: 'Copied',
  share: 'Share',
  reportProblem: 'Report a problem',
  statusAnswered: 'Covered by SOP',
  statusPartial: 'Partially covered',
  statusNotCovered: 'Not covered in SOPs',
  stepsCompleted: 'completed',
  resetChecklist: 'Reset ticks',
  sections: {
    criticalWarnings: 'Critical Safety Warnings',
    scopeSummary: 'Scope Summary',
    appliesTo: 'Applies To',
    prerequisites: 'Prerequisites & Permits',
    materialsTools: 'Materials, Tools & Equipment',
    hazardsPpe: 'Hazards & Required PPE',
    steps: 'Procedure Steps',
    flowchart: 'Process Flowchart',
    tables: 'Specification Tables',
    qualityChecks: 'Quality & Acceptance Checks',
    siteCleanup: 'Site Cleanup',
    exitHandover: 'Exit & Handover',
    recordsReporting: 'Records, Photos & Sign-Offs',
    notSpecified: 'Not Specified in SOPs',
    conflicts: 'Conflicting SOP Statements',
    relatedSops: 'Related SOPs',
    references: 'SOP References',
  },
  tableCols: {
    item: 'Item',
    specQty: 'Spec / Qty',
    type: 'Category',
    check: 'Check Item',
    criteria: 'Acceptance Criteria',
  },
  stepLabels: {
    caution: 'Caution',
    verify: 'Check',
  },
  accessGate: {
    title: 'Team Access Code',
    subtitle: 'Enter the field engineering access code once. It stays saved on this device.',
    placeholder: 'Enter access code',
    submit: 'Unlock SOP Assistant',
    checking: 'Verifying...',
    invalid: 'Incorrect access code. Check with your team lead.',
    notConfigured: 'Server ACCESS_CODE is not configured yet. Add it in Vercel or Secrets.',
    rememberNote: 'Saved locally on this phone for quick field access.',
    signOut: 'Lock',
  },
  debug: {
    title: 'Retrieval & Threshold Tuning',
    subtitle: 'Inspect chunk cosine + BM25 scores and raw model JSON to tune MIN_SCORE.',
    queryLabel: 'Test question',
    minScoreLabel: 'Test MIN_SCORE override',
    runTest: 'Run Diagnostic',
    indexedDocs: 'Indexed Active SOPs',
    bestScore: 'Best Score',
    threshold: 'Threshold',
    aboveThreshold: 'Passed threshold',
    belowThreshold: 'Below threshold (LLM skipped)',
    retrievedChunks: 'Retrieved Chunks',
    rawOutput: 'Raw Model JSON Output',
    neighborTag: 'Neighbor',
    backToChat: 'Back to Chat',
  },
  errorGeneric: 'Unable to complete the request. Check your connection and try again.',
};
