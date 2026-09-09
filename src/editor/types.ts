export interface PickerState {
  query: string;
  hasTrigger?: boolean;
}

export interface LineControlState {
  block: HTMLElement;
  top: number;
  left: number;
  before: boolean;
  nearLeft: boolean;
  hasContent: boolean;
  inside: boolean;
  pointerY?: number;
}
