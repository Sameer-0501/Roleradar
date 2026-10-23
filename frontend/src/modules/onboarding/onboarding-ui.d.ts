/**
 * Type declarations for onboarding-ui.js module.
 */

export interface OnboardingViewOptions {
  isEditing?: boolean;
  currentPreferences?: any;
  onComplete?: (savedPreferences: any) => void;
  onCancel?: () => void;
}

export interface OnboardingViewController {
  destroy: () => void;
}

export function renderOnboardingView(
  containerEl: HTMLElement,
  options?: OnboardingViewOptions
): Promise<OnboardingViewController | undefined>;

export function renderDashboardPreferencesSummary(
  containerEl: HTMLElement,
  preferences?: any,
  onEdit?: () => void
): void;
