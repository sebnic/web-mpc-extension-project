import { Injectable } from '@angular/core';
import { Document } from '../models/document.model';
import { MOCK_DOCUMENTS } from '../data/mock-data';

export interface DocumentSearchParams {
  query?: string;
  category?: string;
  limit?: number;
}

export interface DocumentSearchResult {
  total: number;
  documents: Document[];
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly documents: Document[] = MOCK_DOCUMENTS;

  search(params: DocumentSearchParams = {}): DocumentSearchResult {
    const { query = '', category = '', limit = 10 } = params;
    let results = [...this.documents];
    if (query) {
      results = results.filter(d => d.title.toLowerCase().includes(query.toLowerCase()));
    }
    if (category) {
      results = results.filter(d => d.category.toLowerCase() === category.toLowerCase());
    }
    results = results.slice(0, limit);
    return { total: results.length, documents: results };
  }
}
