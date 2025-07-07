import { Injectable } from '@nestjs/common';
import { OllamaService } from '../ollama/ollama.service';

type DocumentChunk = {
  id: string;
  content: string;
  metadata: any;
  embedding?: number[];
};

@Injectable()
export class RagService {
  private documents: DocumentChunk[] = [];

  constructor(private readonly ollamaService: OllamaService) { }

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

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  async retrieveRelevantContext(
    query: string,
    topK: number = 3, // If topK = 3, the model only considers the 3 most likely next tokens
  ): Promise<string[]> {
    if (this.documents.length === 0) {
      return [];
    }

    // Generate embedding for the query
    const queryEmbedding = await this.ollamaService.embedText(query);

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

  async generateAnswer(query: string): Promise<string> {
    // Retrieve relevant context
    const context = await this.retrieveRelevantContext(query);
    console.log('Retrieved context:', context);

    // Create prompt with context or just the query
    const prompt =
      context.length > 0
        ? `
Context information:
${context.join('\n\n')}

Question: ${query}

Please provide a comprehensive answer based on the context information provided above.
`
        : `Question: ${query}`;

    console.log('Generated prompt:', prompt);

    // Generate answer using Ollama
    return await this.ollamaService.generateResponse(prompt);
  }
}

/*
Relationship with Other Parameters

topP: Works alongside topK - selects tokens based on cumulative probability
temperature: Controls randomness in selection among the topK candidates
typical_p: An alternative to topK/topP that focuses on "typical" tokens

Common Values

topK = 40-50: Good balance for most applications
topK = 1: Deterministic output (always same result)
topK = 0 or very high: Essentially disables topK filtering

The key is finding the right balance between creativity and coherence for your specific use case.
*/
