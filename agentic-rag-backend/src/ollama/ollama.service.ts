import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';

interface EmbeddingResult {
  embedding: number[];
  originalIndex: number;
  text: string;
}

interface StreamingProgress {
  processed: number;
  total: number;
  currentItem?: string;
}

@Injectable()
export class OllamaService {
  private readonly ollamaUrl = 'http://localhost:11434';
  private readonly maxChunkSize = 8000; // Adjust based on your model's context limit
  private readonly batchSize = 5; // Process 5 items concurrently

  async generateResponse(prompt: string): Promise<string> {
    try {
      const response: AxiosResponse<{ response: string }> = await axios.post(`${this.ollamaUrl}/api/generate`, {
        model: 'llama3.2:3b',
        prompt: prompt,
        stream: false,
      });
      return response.data.response;
    } catch (error: unknown) {
      console.error('Error calling Ollama:', error);
      throw new Error('Failed to generate response from Ollama');
    }
  }

  async embedText(text: string): Promise<number[]> {
    try {
      const response: AxiosResponse<{ embedding: number[] }> = await axios.post(`${this.ollamaUrl}/api/embeddings`, {
        model: 'nomic-embed-text', // Use proper embedding model
        prompt: text,
      });
      return response.data.embedding;
    } catch (error: unknown) {
      console.error('Error generating embeddings:', error);
      throw new Error('Failed to generate embeddings');
    }
  }

  /**
   * Stream embeddings for large datasets with progress tracking
   */
  async *streamEmbeddings(
    data: any[],
    progressCallback?: (progress: StreamingProgress) => void,
  ): AsyncGenerator<EmbeddingResult, void, unknown> {
    const processedItems = new Set<number>();

    for (let i = 0; i < data.length; i += this.batchSize) {
      const batch = data.slice(i, Math.min(i + this.batchSize, data.length));

      // Process batch concurrently
      const batchPromises = batch.map(async (item, batchIndex) => {
        const globalIndex = i + batchIndex;

        if (processedItems.has(globalIndex)) {
          return null; // Skip already processed items
        }

        const text = this.prepareTextForEmbedding(item);
        const chunks = this.chunkText(text);

        // Update progress
        if (progressCallback) {
          progressCallback({
            processed: processedItems.size,
            total: data.length,
            currentItem: typeof item === 'string' ? item.substring(0, 50) + '...' : 'Object',
          });
        }

        try {
          let embedding: number[];

          if (chunks.length === 1) {
            // Single chunk, process normally
            embedding = await this.embedText(chunks[0]);
          } else {
            // Multiple chunks, combine embeddings
            embedding = await this.combineChunkEmbeddings(chunks);
          }

          processedItems.add(globalIndex);

          return {
            embedding,
            originalIndex: globalIndex,
            text: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
          };
        } catch (error) {
          console.error(`Error processing item ${globalIndex}:`, error);
          return null;
        }
      });

      // Wait for batch to complete and yield results
      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        if (result) {
          yield result;
        }
      }

      // Small delay to prevent overwhelming the API
      await this.sleep(100);
    }

    // Final progress update
    if (progressCallback) {
      progressCallback({
        processed: processedItems.size,
        total: data.length,
      });
    }
  }

  /**
   * Process large dataset and return all embeddings at once
   */
  async embedLargeDataset(data: any[], progressCallback?: (progress: StreamingProgress) => void): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    for await (const result of this.streamEmbeddings(data, progressCallback)) {
      results.push(result);
    }

    // Sort by original index to maintain order
    return results.sort((a, b) => a.originalIndex - b.originalIndex);
  }

  /**
   * Chunk text into smaller pieces if it exceeds max size
   */
  private chunkText(text: string): string[] {
    if (text.length <= this.maxChunkSize) {
      return [text];
    }

    const chunks: string[] = [];
    let currentChunk = '';
    const words = text.split(/\s+/);

    for (const word of words) {
      if ((currentChunk + ' ' + word).length > this.maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = word;
        } else {
          // Single word is too long, split it
          chunks.push(word.substring(0, this.maxChunkSize));
          currentChunk = word.substring(this.maxChunkSize);
        }
      } else {
        currentChunk += (currentChunk ? ' ' : '') + word;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Combine embeddings from multiple chunks
   */
  private async combineChunkEmbeddings(chunks: string[]): Promise<number[]> {
    const embeddings = await Promise.all(chunks.map((chunk) => this.embedText(chunk)));

    // Average the embeddings (you could also use other combination methods)
    const combinedEmbedding = new Array(embeddings[0].length).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < embedding.length; i++) {
        combinedEmbedding[i] += embedding[i];
      }
    }

    // Normalize by dividing by number of chunks
    return combinedEmbedding.map((value) => value / embeddings.length);
  }

  /**
   * Prepare any data type for embedding
   */
  private prepareTextForEmbedding(item: any): string {
    if (typeof item === 'string') {
      return item;
    }

    if (typeof item === 'object' && item !== null) {
      return JSON.stringify(item);
    }

    return String(item);
  }

  /**
   * Sleep utility for rate limiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get embedding model info
   */
  async getModelInfo(modelName: string = 'nomic-embed-text'): Promise<any> {
    try {
      const response = await axios.post<Record<string, unknown>>(`${this.ollamaUrl}/api/show`, {
        name: modelName,
      });
      return response.data;
    } catch (error) {
      console.error('Error getting model info:', error);
      throw new Error('Failed to get model information');
    }
  }
}
