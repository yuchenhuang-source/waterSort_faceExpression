export default function () {
  let win = window as any;
  const { sdk = "" } = win.MRAID_ENV || {};
  const iosLink = "https://apps.apple.com/us/app/merge-puzzle-game-m2-blocks/id1620319602";
  const androidLink = "https://play.google.com/store/apps/details?id=merge.blocks.drop.number.puzzle.games";
  const isUnity = /unity/i.test(sdk);
  const isIOS =
    /iPad|iPhone|iPod|Macintosh|Mac OS/i.test(navigator.userAgent) &&
    !win.MSStream;
  const link = isIOS ? iosLink : androidLink;;
  if (win.dapi && win.dapi.openStoreUrl) { //IRONSOURCE & APPGROWTH
    win.dapi.openStoreUrl();
  } else if (win.FbPlayableAd) {// FACEBOOK
    win.FbPlayableAd.onCTAClick();
  } else if (win.callSDK) {
    win.callSDK("download");
  } else if (win.ExitApi) { // GOOGLE
    win.ExitApi();
    win.ExitApi.exit && win.ExitApi.exit();
  } else if (win.install) { //MINTEGRAL
    win.install();
    win.gameEnd && win.gameEnd();
  } else if (win.playableSDK && win.playableSDK.openAppStore) { // TIKTOK
    win.playableSDK.openAppStore()
  } else if (typeof mraid !== 'undefined' && mraid.open) { // mraid by default
    mraid.open(isUnity ? link : undefined);
  } else {
    win.open(link);
  }
}