import { Body, Controller, Get, Post } from '@nestjs/common';
import { RagService } from './rag/rag.service';

@Controller()
export class AppController {
  constructor(private readonly ragService: RagService) {}

  @Post('upload')
  async uploadDocument(@Body() body: { query: string }) {
    console.log('Received body:', body.query);
    const jsonData: unknown = JSON.parse(JSON.stringify(body.query));
    await this.ragService.ingestDocument(jsonData);
    return { message: 'Document uploaded and processed successfully' };
  }
  // @UseInterceptors(FileInterceptor('file'))
  // async uploadDocument(@UploadedFile() file: Express.Multer.File) {
  //   try {
  //     console.log('Received file:', file);
  //     const jsonData = JSON.parse(file.buffer.toString()) as unknown;
  //     // Optionally, add validation or type assertion here if you know the expected type, e.g.:
  //     // const documentData = jsonData as YourExpectedType;
  //     await this.ragService.ingestDocument(jsonData);
  //     return { message: 'Document uploaded and processed successfully' };
  //   } catch (error: unknown) {
  //     const message =
  //       error && typeof error === 'object' && 'message' in error
  //         ? String((error as { message: unknown }).message)
  //         : 'Unknown error';
  //     return { error: 'Failed to process document', details: message };
  //   }
  // }

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
