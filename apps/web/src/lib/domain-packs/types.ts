import type { OverlayIntent, SubjectType, ValidatorImagePolicy } from "../media-realism/types";

export interface DomainPackOutput {
  conceptId: string;
  conceptType: string;
  subjectType: SubjectType;
  subjectCount: 1 | 2;
  action: string;
  environment: string;
  mood: string;
  realismMode: "commercial_lifestyle_real" | "clinical_real" | "home_patient_real" | "human_lifestyle_real" | "home_real" | "workspace_real" | "product_in_use_real";
  requiredProps: string[];
  forbiddenProps: string[];
  forbiddenScenes: string[];
  overlayIntent: OverlayIntent;
  validatorPolicy: ValidatorImagePolicy;
}

export interface DomainPack {
  normalize(input: unknown): DomainPackOutput;
}
