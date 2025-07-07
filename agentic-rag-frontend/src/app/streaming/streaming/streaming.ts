import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import { EmbeddingResult, OllamaService, StreamingProgress } from '../../services/ollama.service';


type ProcessingStats = {
  totalItems: number;
  processedItems: number;
  embeddings: EmbeddingResult[];
  startTime: Date;
  endTime?: Date;
  duration?: number;
}

@Component({
  selector: 'app-streaming',
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './streaming.html',
  styleUrl: './streaming.scss',
})
export class StreamingComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private ollamaService = inject(OllamaService);
  private apiUrl = 'http://localhost:3000';
  private subscriptions: Subscription[] = [];

  // File upload signals
  selectedFile = signal<File | null>(null);
  uploading = signal(false);
  uploadStatus = signal<{ success: boolean; message: string } | null>(null);
  
  // Query signals
  query = '';
  answer = signal<string>('');
  processing = signal(false);
  queryHistory = signal<
    Array<{ question: string; answer: string; timestamp: Date }>
  >([]);

  // Embedding processing signals
  isProcessingEmbeddings = signal(false);
  streamingProgress = signal<StreamingProgress | null>(null);
  processingStats = signal<ProcessingStats | null>(null);
  useStreaming = signal(true);
  embeddings = signal<EmbeddingResult[]>([]);
  
  // Error handling
  processingError = signal<string | null>(null);

  ngOnInit() {
    this.setupStreamingSubscriptions();
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }

  private setupStreamingSubscriptions() {
    // Progress subscription
    const progressSub = this.ollamaService.progress$.subscribe(progress => {
      this.streamingProgress.set(progress);
    });

    // Embedding subscription
    const embeddingSub = this.ollamaService.embedding$.subscribe(result => {
      const currentEmbeddings = this.embeddings();
      this.embeddings.set([...currentEmbeddings, result]);
    });

    // Complete subscription
    const completeSub = this.ollamaService.complete$.subscribe(result => {
      this.isProcessingEmbeddings.set(false);
      const stats = this.processingStats();
      if (stats) {
        stats.endTime = new Date();
        stats.duration = stats.endTime.getTime() - stats.startTime.getTime();
        this.processingStats.set({ ...stats });
      }
      console.log('Embedding processing complete:', result);
    });

    // Error subscription
    const errorSub = this.ollamaService.error$.subscribe(error => {
      this.isProcessingEmbeddings.set(false);
      this.processingError.set(error.message || 'Unknown error occurred');
      console.error('Embedding processing error:', error);
    });

    this.subscriptions.push(progressSub, embeddingSub, completeSub, errorSub);
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    console.log('Selected file:', file);
    if (file && file.type === 'application/json') {
      this.selectedFile.set(file);
      this.uploadStatus.set(null);
      this.processingError.set(null);
    } else {
      this.uploadStatus.set({
        success: false,
        message: 'Please select a JSON file',
      });
    }
  }

  async uploadFile() {
    const file = this.selectedFile();
    if (!file) return;

    this.uploading.set(true);
    this.uploadStatus.set(null);

    try {
      const reader: FileReader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = event.target?.result;
          const parsedData = JSON.parse(json as string);
          
          // Validate data structure
          if (!Array.isArray(parsedData)) {
            throw new Error('JSON file must contain an array of data');
          }

          console.log('Parsed JSON:', parsedData);

          // Upload to your existing endpoint
          const response = await firstValueFrom(
            this.http.post<any>(`${this.apiUrl}/upload`, {query: parsedData})
          );

          if (response.error) {
            this.uploadStatus.set({
              success: false,
              message: response.error,
            });
          } else {
            this.uploadStatus.set({
              success: true,
              message: 'File uploaded successfully! Ready for embedding processing.',
            });
          }

          console.log('Upload response:', response);
        } catch (parseError) {
          this.uploadStatus.set({
            success: false,
            message: 'Invalid JSON file format',
          });
          console.error('JSON parsing error:', parseError);
        } finally {
          this.uploading.set(false);
        }
      };

      reader.readAsText(file);
    } catch (error) {
      this.uploading.set(false);
      this.uploadStatus.set({
        success: false,
        message: 'Failed to process file',
      });
      console.error('File processing error:', error);
    }
  }

  async processEmbeddings() {
    const file = this.selectedFile();
    if (!file) {
      this.processingError.set('Please select a file first');
      return;
    }

    this.isProcessingEmbeddings.set(true);
    this.processingError.set(null);
    this.embeddings.set([]);
    this.ollamaService.resetStreamingState();

    try {
      const reader: FileReader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = event.target?.result;
          const parsedData = JSON.parse(json as string);
          
          if (!Array.isArray(parsedData)) {
            throw new Error('JSON file must contain an array of data');
          }

          // Initialize processing stats
          this.processingStats.set({
            totalItems: parsedData.length,
            processedItems: 0,
            embeddings: [],
            startTime: new Date(),
          });

          if (this.useStreaming()) {
            // Stream processing
            await this.ollamaService.streamEmbeddings(parsedData);
          } else {
            // Batch processing
            const results = await this.ollamaService.batchEmbeddings(parsedData);
            this.embeddings.set(results);
            this.isProcessingEmbeddings.set(false);
            
            const stats = this.processingStats();
            if (stats) {
              stats.endTime = new Date();
              stats.duration = stats.endTime.getTime() - stats.startTime.getTime();
              stats.processedItems = results.length;
              this.processingStats.set({ ...stats });
            }
          }
        } catch (error) {
          const errorMessage = (error && typeof error === 'object' && 'message' in error)
            ? (error as { message: string }).message
            : 'Failed to process embeddings';
          this.processingError.set(errorMessage);
          this.isProcessingEmbeddings.set(false);
          console.error('Embedding processing error:', error);
        }
      };

      reader.readAsText(file);
    } catch (error) {
      this.processingError.set('Failed to read file');
      this.isProcessingEmbeddings.set(false);
      console.error('File reading error:', error);
    }
  }

  async submitQuery() {
    if (!this.query.trim()) return;

    this.processing.set(true);
    const currentQuery = this.query.trim();

    try {
      const response = await firstValueFrom(
        this.http.post<any>(`${this.apiUrl}/query`, { query: currentQuery })
      );

      this.answer.set(response.answer);

      // Add to history
      const history = this.queryHistory();
      history.unshift({
        question: currentQuery,
        answer: response.answer,
        timestamp: new Date(),
      });
      this.queryHistory.set([...history]);

      this.query = '';
    } catch (error) {
      this.answer.set('Error: Failed to get answer. Please try again.');
    } finally {
      this.processing.set(false);
    }
  }

  toggleProcessingMode() {
    this.useStreaming.set(!this.useStreaming());
  }

  clearEmbeddings() {
    this.embeddings.set([]);
    this.processingStats.set(null);
    this.streamingProgress.set(null);
    this.processingError.set(null);
  }

  exportEmbeddings() {
    const embeddings = this.embeddings();
    if (embeddings.length === 0) {
      alert('No embeddings to export');
      return;
    }

    const dataStr = JSON.stringify(embeddings, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `embeddings_${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  // Helper methods
  get progressPercentage(): number {
    const progress = this.streamingProgress();
    return progress?.percentage || 0;
  }

  get processingDuration(): string {
    const stats = this.processingStats();
    if (!stats?.duration) return '';
    
    const seconds = Math.floor(stats.duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
  }

  public formatEmbeddingVector(vector: number[]): string {
    if (!Array.isArray(vector)) return '';
    const preview = vector.slice(0, 5).map(v => v.toFixed(3)).join(', ');
    return vector.length > 5 ? `${preview}, ...` : preview;
  }
}