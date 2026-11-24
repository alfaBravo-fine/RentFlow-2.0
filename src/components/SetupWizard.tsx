import React from 'react';
import { StorageSelector, DATA_PATH_STORAGE_KEY } from './StorageSelector';

export { DATA_PATH_STORAGE_KEY };

export const SetupWizard: React.FC = () => {
  return (
    <StorageSelector
      mode="local"
      onComplete={() => {
        window.location.reload();
      }}
    />
  );
};

export default SetupWizard;
