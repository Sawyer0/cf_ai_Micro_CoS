export interface Conversation {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: Date;
  readonly createdAt: Date;
}

export class ConversationEntity {
  private constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly updatedAt: Date,
    public readonly createdAt: Date,
  ) {}

  static create(title: string): ConversationEntity {
    return new ConversationEntity(
      crypto.randomUUID(),
      title,
      new Date(),
      new Date(),
    );
  }

  static reconstitute(data: Conversation): ConversationEntity {
    return new ConversationEntity(
      data.id,
      data.title,
      new Date(data.updatedAt),
      new Date(data.createdAt),
    );
  }

  rename(newTitle: string): ConversationEntity {
    return new ConversationEntity(
      this.id,
      newTitle,
      new Date(),
      this.createdAt,
    );
  }

  updateTimestamp(): ConversationEntity {
    return new ConversationEntity(
      this.id,
      this.title,
      new Date(),
      this.createdAt,
    );
  }

  toJSON(): Conversation {
    return {
      id: this.id,
      title: this.title,
      updatedAt: this.updatedAt,
      createdAt: this.createdAt,
    };
  }
}
