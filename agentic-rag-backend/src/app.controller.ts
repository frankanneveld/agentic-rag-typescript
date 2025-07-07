import { Body, Controller, Get, HttpStatus, Post, Res } from '@nestjs/common';
import { RagService } from './rag/rag.service';
import { OllamaService } from './ollama/ollama.service';
import { Response } from 'express';

export type EmbeddingRequest = {
  data: any[];
  streamResponse?: boolean;
};

@Controller()
export class AppController {
  constructor(
    private readonly ragService: RagService,
    private readonly ollamaService: OllamaService,
  ) {}

  @Post('upload')
  async uploadDocument(@Body() body: { query: string }) {
    let jsonData: unknown;
    try {
      jsonData = JSON.parse(JSON.stringify(body.query));
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Unknown error during JSON parsing';
      return { error: 'Failed to parse document', details: message };
    }
    await this.ragService.ingestDocument(jsonData);
    return { message: 'Document uploaded and processed successfully' };
  }

  @Post('query')
  async queryDocument(@Body() body: { query: string }) {
    try {
      const answer = await this.ragService.generateAnswer(body.query);
      return { answer };
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : 'Unknown error';
      return { error: 'Failed to generate answer', details: message };
    }
  }

  @Get('health')
  checkHealth() {
    return {
      status: 'Backend is running',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('embed-large-dataset')
  async embedLargeDataset(@Body() request: EmbeddingRequest, @Res() res: Response) {
    try {
      const { data, streamResponse = false } = request;

      if (!data || !Array.isArray(data)) {
        return res.status(HttpStatus.BAD_REQUEST).json({
          error: 'Data must be an array',
        });
      }

      if (streamResponse) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        });

        let processedCount = 0;

        const progressCallback = (progress: any) => {
          res.write(`event: progress\n`);
          res.write(`data: ${JSON.stringify(progress)}\n\n`);
        };

        for await (const result of this.ollamaService.streamEmbeddings(data, progressCallback)) {
          res.write(`event: embedding\n`);
          res.write(`data: ${JSON.stringify(result)}\n\n`);
          processedCount++;
        }

        res.write(`event: complete\n`);
        res.write(
          `data: ${JSON.stringify({
            message: 'Processing complete',
            totalProcessed: processedCount,
          })}\n\n`,
        );
        res.end();
      } else {
        const progressCallback = (progress: any) => {
          // Optionally log progress
          console.log(`Processed: ${progress} `);
        };

        const results = await this.ollamaService.embedLargeDataset(data, progressCallback);

        return res.status(HttpStatus.OK).json({
          embeddings: results,
          totalProcessed: results.length,
        });
      }
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: 'Failed to process embeddings',
        details: message,
      });
    }
  }

  @Post('embed-single')
  async embedSingle(@Body() request: { text: string }) {
    try {
      const embedding = await this.ollamaService.embedText(request.text);
      return { embedding };
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error);
      return { error: 'Failed to embed text', details: message };
    }
  }

  @Post('model-info')
  async getModelInfo(@Body() request: { modelName?: string }) {
    try {
      const info = (await this.ollamaService.getModelInfo(request.modelName)) as Record<string, unknown>;
      return { modelInfo: info };
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error);
      return { error: 'Failed to retrieve model info', details: message };
    }
  }
}
