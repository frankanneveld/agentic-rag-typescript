import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';

@Injectable()
export class OllamaService {
  private readonly ollamaUrl = 'http://localhost:11434';

  async generateResponse(prompt: string): Promise<string> {
    console.log('Generating response for prompt:', prompt);
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
    console.log('Embedding text:', text);
    try {
      const response: AxiosResponse<{ embedding: number[] }> = await axios.post(`${this.ollamaUrl}/api/embeddings`, {
        model: 'llama3.2:3b',
        prompt: text,
      });
      return response.data.embedding;
    } catch (error: unknown) {
      console.error('Error generating embeddings:', error);
      throw new Error('Failed to generate embeddings');
    }
  }
}
