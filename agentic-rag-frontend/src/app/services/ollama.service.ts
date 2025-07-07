import { HttpClient } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { BehaviorSubject, Subject } from "rxjs";

export type EmbeddingResult = {
  embedding: number[];
  originalIndex: number;
  text: string;
};

export type StreamingProgress = {
  processed: number;
  total: number;
  currentItem?: string;
  percentage?: number;
};

export type EmbeddingRequest = {
  data: any[];
  streamResponse?: boolean;
};

@Injectable({
  providedIn: "root",
})
export class OllamaService {
  private http = inject(HttpClient);
  private apiUrl = "http://localhost:3000";

  // Subjects for streaming data
  private progressSubject = new BehaviorSubject<StreamingProgress | null>(null);
  private embeddingSubject = new Subject<EmbeddingResult>();
  private completeSubject = new Subject<any>();
  private errorSubject = new Subject<any>();

  // Observables
  progress$ = this.progressSubject.asObservable();
  embedding$ = this.embeddingSubject.asObservable();
  complete$ = this.completeSubject.asObservable();
  error$ = this.errorSubject.asObservable();

  /**
   * Process large dataset with streaming
   */
  async streamEmbeddings(data: any[]): Promise<void> {
    try {
      // Reset subjects
      this.progressSubject.next(null);

      const response = await fetch(
        `${this.apiUrl}/ollama/embed-large-dataset`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data,
            streamResponse: true,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body reader available");
      }

      let buffer = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");

        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "") continue;

          if (line.startsWith("event: ")) {
            currentEvent = line.substring(7).trim();
            continue;
          }

          if (line.startsWith("data: ")) {
            const data = line.substring(6);

            try {
              const parsed = JSON.parse(data);

              switch (currentEvent) {
                case "progress":
                  const progress = {
                    ...parsed,
                    percentage: Math.round(
                      (parsed.processed / parsed.total) * 100
                    ),
                  };
                  this.progressSubject.next(progress);
                  break;
                case "embedding":
                  this.embeddingSubject.next(parsed);
                  break;
                case "complete":
                  this.completeSubject.next(parsed);
                  break;
              }
            } catch (e) {
              console.warn("Failed to parse SSE data:", data);
            }
          }
        }
      }
    } catch (error) {
      this.errorSubject.next(error);
      throw error;
    }
  }

  /**
   * Process large dataset without streaming (batch)
   */
  async batchEmbeddings(data: any[]): Promise<EmbeddingResult[]> {
    try {
      const response = await this.http
        .post<{
          embeddings: EmbeddingResult[];
          totalProcessed: number;
        }>(`${this.apiUrl}/ollama/embed-large-dataset`, {
          data,
          streamResponse: false,
        })
        .toPromise();

      return response?.embeddings || [];
    } catch (error) {
      console.error("Batch processing error:", error);
      throw error;
    }
  }

  /**
   * Embed single text
   */
  async embedSingle(text: string): Promise<number[]> {
    try {
      const response = await this.http
        .post<{ embedding: number[] }>(`${this.apiUrl}/ollama/embed-single`, {
          text,
        })
        .toPromise();

      return response?.embedding || [];
    } catch (error) {
      console.error("Single embedding error:", error);
      throw error;
    }
  }

  /**
   * Get model information
   */
  async getModelInfo(modelName?: string): Promise<any> {
    try {
      const response = await this.http
        .post<{ modelInfo: any }>(`${this.apiUrl}/ollama/model-info`, {
          modelName,
        })
        .toPromise();

      return response?.modelInfo;
    } catch (error) {
      console.error("Model info error:", error);
      throw error;
    }
  }

  /**
   * Reset streaming state
   */
  resetStreamingState(): void {
    this.progressSubject.next(null);
  }
}
