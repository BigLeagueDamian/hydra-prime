export type CallShape = 'classify' | 'extract' | 'route' | 'sanity_check';

export interface BrainCall {
  shape: CallShape;
  system: string;
  user: string;
  schema?: object;
}

export interface BrainResponse {
  provider: string;
  model: string;
  output: string;
  tokensUsed: number;
  costUsd: number;
  isPaidTier: boolean;
}
