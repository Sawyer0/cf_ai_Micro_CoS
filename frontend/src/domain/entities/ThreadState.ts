export interface ThreadState {
  readonly conversationId: string;
  readonly isStreaming: boolean;
  readonly currentStreamingMessage: string;
  readonly error: string | null;
}

export class ThreadStateEntity {
  private constructor(
    public readonly conversationId: string,
    public readonly isStreaming: boolean,
    public readonly currentStreamingMessage: string,
    public readonly error: string | null,
  ) {}

  static create(conversationId: string): ThreadStateEntity {
    return new ThreadStateEntity(conversationId, false, "", null);
  }

  startStreaming(): ThreadStateEntity {
    return new ThreadStateEntity(this.conversationId, true, "", null);
  }

  appendToken(token: string): ThreadStateEntity {
    return new ThreadStateEntity(
      this.conversationId,
      true,
      this.currentStreamingMessage + token,
      null,
    );
  }

  finishStreaming(): ThreadStateEntity {
    return new ThreadStateEntity(this.conversationId, false, "", null);
  }

  setError(error: string): ThreadStateEntity {
    return new ThreadStateEntity(this.conversationId, false, "", error);
  }

  clearError(): ThreadStateEntity {
    return new ThreadStateEntity(
      this.conversationId,
      this.isStreaming,
      this.currentStreamingMessage,
      null,
    );
  }

  toJSON(): ThreadState {
    return {
      conversationId: this.conversationId,
      isStreaming: this.isStreaming,
      currentStreamingMessage: this.currentStreamingMessage,
      error: this.error,
    };
  }
}
