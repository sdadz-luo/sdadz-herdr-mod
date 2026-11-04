export const OPEN_LOCATION = "files-plus.open-location";
export const OPEN_OPTIONS = [
  { value: "tab", label: "在中间区域新标签打开" },
  { value: "pane", label: "在中间区域分屏打开" },
  { value: "internal", label: "在右侧栏内打开" },
];

export function openLocation(value) {
  return OPEN_OPTIONS.some(option => option.value === value) ? value : "tab";
}
