import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000';

  // Signals
  selectedFile = signal<File | null>(null);
  uploading = signal(false);
  uploadStatus = signal<{ success: boolean; message: string } | null>(null);
  query = '';
  answer = signal<string>('');
  processing = signal(false);
  queryHistory = signal<
    Array<{ question: string; answer: string; timestamp: Date }>
  >([]);

  onFileSelected(event: any) {
    const file = event.target.files[0];
    console.log('Selected file:', file);
    if (file && file.type === 'application/json') {
      this.selectedFile.set(file);
      this.uploadStatus.set(null);
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

    const reader: FileReader = new FileReader();
    reader.onload = async (event) => {
      const json = event.target?.result;
      console.log('File content:', json, 'Type:', typeof json);
      console.log('Event:', event);
      console.log('Reader:', reader);

      const parsedData = JSON.parse(json as string);
      console.log('Parsed JSON:', parsedData);

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
          message: 'File uploaded successfully!',
        });
      }

      console.log('Upload response:', response);
    };

    reader.readAsText(file);

    /*
    try {
      const formData = new FormData();
      formData.append('file', file);

      console.log('FormData:', formData);

      const response = await firstValueFrom(
        this.http.post<any>(`${this.apiUrl}/upload`, formData)
      );

      console.log('Upload response:', response);

      if (response.error) {
        this.uploadStatus.set({
          success: false,
          message: response.error,
        });
      } else {
        this.uploadStatus.set({
          success: true,
          message: 'File uploaded successfully!',
        });
      }
    } catch (error) {
      this.uploadStatus.set({
        success: false,
        message: 'Failed to upload document. Please try again.',
      });
    } finally {
      this.uploading.set(false);
    }

    */
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
}
