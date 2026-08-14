export type AnnouncementTone = "warning" | "success" | "info";

export type Announcement = {
  id: string;
  title: string;
  detail: string;
  tone: AnnouncementTone;
  published: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type GuideFeedbackRecord = {
  id: string;
  guideId: string;
  guideTitle: string;
  product: string;
  category: string;
  subtype: string;
  sourceSheet?: string;
  sourceRow?: number;
  helpful: boolean;
  comment: string | null;
  createdAt: string;
  createdBy?: string;
};

export type GuideFeedbackInput = {
  guideId: string;
  guideTitle: string;
  product: string;
  category: string;
  subtype: string;
  sourceSheet?: string;
  sourceRow?: number;
  helpful: boolean;
  comment?: string;
};
