import { Injectable } from '@angular/core';
import { DocChunk, LO_DOC_CHUNKS } from '../data/lo-doc-data';

export interface DocSearchResult {
  section: string;
  content: string;
  categories: string[];
}

@Injectable({ providedIn: 'root' })
export class LoDocService {

  search(query: string, categories?: string[], limit = 6): DocSearchResult[] {
    if (!query?.trim()) return LO_DOC_CHUNKS.slice(0, limit).map(this.toResult);

    const words = query.toLowerCase().split(/[\s,;]+/).filter(w => w.length > 2);

    return LO_DOC_CHUNKS
      .filter((chunk): boolean => {
        if (categories && categories.length > 0) {
          return chunk.categories.some(c => categories.includes(c));
        }
        return true;
      })
      .map(chunk => {
        const hay = `${chunk.section} ${chunk.content}`.toLowerCase();
        const score = words.reduce(
          (s, w) => s + (hay.includes(w) ? (chunk.section.toLowerCase().includes(w) ? 3 : 1) : 0),
          0
        );
        return { score, chunk };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ chunk }) => this.toResult(chunk));
  }

  private toResult(chunk: DocChunk): DocSearchResult {
    return {
      section: chunk.section,
      content: chunk.content,
      categories: chunk.categories,
    };
  }
}
