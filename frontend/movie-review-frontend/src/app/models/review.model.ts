export interface Review {
  _id: string;
  movieId: any;
  userId: any;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewFormData {
  rating: number;
  comment: string;
}
