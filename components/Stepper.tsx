import React from 'react';
import { Step } from '../types';
import { OsStepper } from './os';

interface StepperProps {
  currentStep: Step;
}

// Thin wrapper kept for compatibility: renders the OneStock OsStepper.
export const Stepper: React.FC<StepperProps> = ({ currentStep }) => (
  <OsStepper steps={['Orchestration scenarios', 'Results visualisation']} current={currentStep - 1} />
);
