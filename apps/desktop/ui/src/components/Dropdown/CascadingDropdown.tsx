import { CustomDropdown, DropdownOption } from './CustomDropdown';

interface UseCaseOption {
  value: string;
  label: string;
}

export interface UseCaseGroup {
  value: string;
  label: string;
  useCases: UseCaseOption[];
}

interface CascadingDropdownProps {
  groupValue: string;
  useCaseValue: string;
  groups: UseCaseGroup[];
  onGroupChange: (group: string) => void;
  onUseCaseChange: (useCase: string) => void;
  label?: string;
  disabled?: boolean;
}

export function CascadingDropdown({
  groupValue,
  useCaseValue,
  groups,
  onGroupChange,
  onUseCaseChange,
  label,
  disabled = false,
}: CascadingDropdownProps) {
  // Convert groups to dropdown options
  const groupOptions: DropdownOption<string>[] = groups.map((g) => ({
    value: g.value,
    label: g.label,
  }));

  // Find current group and its use cases
  const currentGroup = groups.find((g) => g.value === groupValue);
  const useCaseOptions: DropdownOption<string>[] = currentGroup
    ? currentGroup.useCases.map((uc) => ({
        value: uc.value,
        label: uc.label,
      }))
    : [];

  return (
    <div className="flex gap-2">
      {/* Group Dropdown (left) */}
      <div className="flex-1">
        <CustomDropdown
          value={groupValue}
          options={groupOptions}
          onChange={onGroupChange}
          label={label ? `${label} - Group` : 'Group'}
          disabled={disabled}
          size="md"
        />
      </div>

      {/* Use Case Dropdown (right) */}
      <div className="flex-1">
        <CustomDropdown
          value={useCaseValue}
          options={useCaseOptions}
          onChange={onUseCaseChange}
          label={label ? `${label} - Specific` : 'Specific'}
          disabled={disabled || useCaseOptions.length === 0}
          size="md"
        />
      </div>
    </div>
  );
}
