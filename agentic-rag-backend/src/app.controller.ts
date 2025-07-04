import { Body, Controller, Get, Post } from '@nestjs/common';
import { RagService } from './rag/rag.service';

@Controller()
export class AppController {
  constructor(private readonly ragService: RagService) {}

  @Post('upload')
  async uploadDocument(@Body() body: { query: string }) {
    console.log('Received body:', body.query);
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
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Unknown error';
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
}
