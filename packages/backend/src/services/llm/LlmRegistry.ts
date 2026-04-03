import type { LlmProvider, LlmModelMeta } from './LlmProvider';

export interface LlmModelEntry extends LlmModelMeta {
  providerId: string;
  providerDisplayName: string;
}

export class LlmRegistry {
  private providers = new Map<string, LlmProvider>();
  private modelIndex = new Map<string, LlmProvider>(); // modelId → provider

  register(provider: LlmProvider): void {
    this.providers.set(provider.meta.id, provider);
    for (const model of provider.meta.models) {
      this.modelIndex.set(model.id, provider);
    }
  }

  getProvider(modelId: string): LlmProvider | undefined {
    return this.modelIndex.get(modelId);
  }

  getAvailableModels(): LlmModelEntry[] {
    return Array.from(this.providers.values())
      .filter((p) => p.isAvailable())
      .flatMap((p) =>
        p.meta.models.map((m) => ({
          ...m,
          providerId: p.meta.id,
          providerDisplayName: p.meta.displayName,
        }))
      );
  }
}

export const llmRegistry = new LlmRegistry();
