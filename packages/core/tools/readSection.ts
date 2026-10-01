import { DocumentAdapter, Heading, ParagraphInfo } from '../types';

export class ReadSectionTool {
  private adapter: DocumentAdapter;

  constructor(adapter: DocumentAdapter) {
    this.adapter = adapter;
  }

  async execute(headingTextOrPath: string): Promise<string> {
    const paragraphs = await this.adapter.getParagraphs();
    const query = headingTextOrPath.toLowerCase().trim();

    let inTargetSection = false;
    let targetLevel = 0;
    const collectedTexts: string[] = [];

    for (const p of paragraphs) {
      const pText = p.text.trim();
      if (!pText) continue;

      if (p.headingLevel && p.headingLevel > 0) {
        if (inTargetSection) {
          // If we reach a heading of equal or higher level, end the section
          if (p.headingLevel <= targetLevel) {
            break;
          }
        }

        if (pText.toLowerCase().includes(query)) {
          inTargetSection = true;
          targetLevel = p.headingLevel;
          collectedTexts.push(`### ${pText}`);
          continue;
        }
      }

      if (inTargetSection) {
        collectedTexts.push(pText);
      }
    }

    if (collectedTexts.length === 0) {
      return `Section matching "${headingTextOrPath}" was not found in the document.`;
    }

    return collectedTexts.join('\n\n');
  }
}

export class GetOutlineTool {
  private adapter: DocumentAdapter;

  constructor(adapter: DocumentAdapter) {
    this.adapter = adapter;
  }

  async execute(): Promise<Heading[]> {
    return await this.adapter.getOutline();
  }
}

export class ProposeEditTool {
  private suggestions: any[] = [];

  constructor() {
    this.suggestions = [];
  }

  /**
   * Records a suggestion in memory.
   * HARD RULE: No tool touches or modifies the host document.
   */
  execute(suggestion: any): { status: string; id: string } {
    this.suggestions.push(suggestion);
    return { status: 'recorded', id: suggestion.id };
  }

  getProposals(): any[] {
    return this.suggestions;
  }

  clear() {
    this.suggestions = [];
  }
}
