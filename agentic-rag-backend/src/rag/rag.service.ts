import { Injectable } from '@nestjs/common';
import { OllamaService } from '../ollama/ollama.service';

interface DocumentChunk {
  id: string;
  content: string;
  metadata: any;
  embedding?: number[];
}

@Injectable()
export class RagService {
  private documents: DocumentChunk[] = [];

  constructor(private readonly ollamaService: OllamaService) {}

  /**
   * Ingest a document into the RAG service
   * @param jsonData - The document to ingest
   */
  async ingestDocument(jsonData: any): Promise<void> {
    // Convert JSON data to text chunks
    const chunks = this.chunkDocument(jsonData);

    console.log(`Ingesting ${chunks.length} chunks from document.`);
    console.log('Chunks:', chunks);

    // Generate embeddings for each chunk
    for (const chunk of chunks) {
      chunk.embedding = await this.ollamaService.embedText(chunk.content);
      this.documents.push(chunk);
    }
  }

  /**
   * Chunk the document into smaller chunks
   * @param data - The document to chunk
   * @returns An array of chunks
   */
  private chunkDocument(data: any): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    // Simple chunking strategy - convert object to text
    const textContent = JSON.stringify(data, null, 2);
    const chunkSize = 500;

    for (let i = 0; i < textContent.length; i += chunkSize) {
      const chunk = textContent.slice(i, i + chunkSize);
      chunks.push({
        id: `chunk_${i / chunkSize}`,
        content: chunk,
        metadata: { source: 'uploaded_document', chunk_index: i / chunkSize },
      });
    }

    return chunks;
  }

  /**
   * Calculate the cosine similarity between two vectors
   * @param a - The first vector
   * @param b - The second vector
   * @returns The cosine similarity between the two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Retrieve the most relevant context for a query
   * @param query - The query to retrieve context for
   * @param topK - The number of top results to return
   * @returns An array of the most relevant context
   */
  async retrieveRelevantContext(query: string, topK: number = 3): Promise<string[]> {
    if (this.documents.length === 0) {
      return [];
    }

    // Generate embedding for the query
    const queryEmbedding: number[] = await this.ollamaService.embedText(query);

    console.log('Query embedding:', queryEmbedding); // [0.0001, 0.0002, 0.0003, ...]

    // Calculate similarities
    const similarities = this.documents.map((doc) => ({
      content: doc.content,
      similarity: this.cosineSimilarity(queryEmbedding, doc.embedding || []),
    }));

    // Sort by similarity and return top K
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map((item) => item.content);
  }

  /**
   * Generate an answer to a query
   * @param query - The query to generate an answer for
   * @returns The generated answer
   */
  async generateAnswer(query: string): Promise<string> {
    // Retrieve relevant context
    const context = await this.retrieveRelevantContext(query);

    // Create prompt with context
    const prompt =
      context.length > 0
        ? `
Context information:
${context.join('\n\n')}

Question: ${query}

Please provide a comprehensive answer based on the context information provided above.
Show the sources you have used to answer the question.
`
        : `Question: ${query}`;

    // Generate answer using Ollama
    return await this.ollamaService.generateResponse(prompt);
  }
}
