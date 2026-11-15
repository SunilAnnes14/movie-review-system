export interface Review {
  _id: string;
  movieId: any;
  userId: any;
  rating: number;
  comment: string;
  containsSpoilers?: boolean;
  spoilerSentences?: number[];
  spoilerMarkedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewFormData {
  rating: number;
  comment: string;
  containsSpoilers?: boolean;
}
