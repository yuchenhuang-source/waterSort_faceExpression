import { EventBus } from "@/game/EventBus";

const win = window as any
const mraid = win.mraid;

// Wait for the SDK to become ready: 
export function Start() {
  if (mraid && mraid.getState() === 'loading') {
    // If the SDK is still loading, add a listener for the 'ready' event:
    mraid.addEventListener('ready', onSdkReady);
    // Otherwise, if the SDK is ready, execute your function:
  } else {
    onSdkReady();
  }
}

// Implement a function that shows the ad when it first renders:
function onSdkReady() {
  if (!mraid) {
    showMyAd();
  } else {
    // The viewableChange event fires if the ad container's viewability status changes.
    // Add a listener for the viewabilityChange event, to handle pausing and resuming: 
    mraid.addEventListener('viewableChange', viewableChangeHandler);
    // The isViewable method returns whether the ad container is viewable on the screen.
    if (mraid.isViewable()) {
      // If the ad container is visible, play the ad:
      showMyAd();
    }
  }

}

// Implement a function for executing the ad:
function showMyAd() {
  // Insert code for showing your playable ad. 
  EventBus.emit('showAd'); // Emit an event to your game logic to show the ad.
}

// Implement a function that handles pausing and resuming the ad based on visibility:
function viewableChangeHandler(viewable: boolean) {
  if (viewable) {
    // If the ad is viewable, show the ad:
    showMyAd();
  } else {
    // If not, pause the ad.
    EventBus.emit('pauseAd'); // Emit an event to your game logic to pause the ad.
  }
}