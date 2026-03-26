import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

function getFolderName(workspaceUri: string): string {
  const clean = workspaceUri.replace('file://', '').replace(/\/$/, '');
  return clean.split('/').pop() || '';
}

/**
 * Uses AppleScript to find an Antigravity window matching the workspace name
 * and clicks its red close button (button 1). This allows the app to clean up
 * gracefully instead of force-killing the process.
 */
export async function closeAntigravityWindow(workspaceUri: string): Promise<boolean> {
  const folderName = getFolderName(workspaceUri);
  if (!folderName) return false;

  const script = `
    tell application "System Events"
      if not (exists process "Antigravity") then return "false"
      
      tell process "Antigravity"
        set targetWindow to missing value
        repeat with w in (every window)
          if name of w contains "${folderName}" then
            set targetWindow to w
            exit repeat
          end if
        end repeat
        
        if targetWindow is not missing value then
          click button 1 of targetWindow
          return "true"
        else
          return "false"
        end if
      end tell
    end tell
  `;

  try {
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 2000, killSignal: 'SIGKILL' });
    return stdout.trim() === 'true';
  } catch (e) {
    console.error(`❌ Failed to close window for ${folderName}:`, e);
    return false;
  }
}

/**
 * Uses AppleScript to minimize the Antigravity window matching the workspace name.
 */
export async function minimizeAntigravityWindow(workspaceUri: string): Promise<boolean> {
  const folderName = getFolderName(workspaceUri);
  if (!folderName) return false;

  const script = `
    tell application "System Events"
      if not (exists process "Antigravity") then return "false"
      
      tell process "Antigravity"
        set targetWindow to missing value
        repeat with w in (every window)
          if name of w contains "${folderName}" then
            set targetWindow to w
            exit repeat
          end if
        end repeat
        
        if targetWindow is not missing value then
          set value of attribute "AXMinimized" of targetWindow to true
          return "true"
        else
          return "false"
        end if
      end tell
    end tell
  `;

  try {
    const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`, { timeout: 2000 });
    return stdout.trim() === 'true';
  } catch (e) {
    console.error(`❌ Failed to minimize window for ${folderName}:`, e);
    return false;
  }
}
