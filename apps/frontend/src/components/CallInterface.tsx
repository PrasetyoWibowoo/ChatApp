import { Show, createEffect } from 'solid-js';
import { webrtcService } from '../lib/webrtc';
import { PhoneIcon, VideoIcon, PhoneOffIcon, MicIcon, MicOffIcon, VideoOffIcon } from './Icons';

export default function CallInterface() {
  const [callState] = webrtcService.callState;

  // Auto-cleanup on unmount
  createEffect(() => {
    return () => {
      if (callState().isInCall) {
        webrtcService.endCall();
      }
    };
  });

  return (
    <Show when={callState().isInCall || callState().isRinging}>
      <div class="call-overlay">
        <div class="call-container">
          {/* Remote Video (large) */}
          <video 
            id="remote-video" 
            class="remote-video" 
            autoplay 
            playsinline
          />

          {/* Local Video (small, picture-in-picture) */}
          <Show when={callState().callType === 'video'}>
            <video 
              id="local-video" 
              class="local-video" 
              autoplay 
              playsinline 
              muted
            />
          </Show>

          {/* Call Info */}
          <div class="call-info">
            <h2>{callState().remoteUsername || 'Unknown'}</h2>
            <p class="call-status">
              <Show 
                when={callState().isRinging}
                fallback={<span>Connected • {callState().callType === 'video' ? 'Video' : 'Voice'} Call</span>}
              >
                <Show 
                  when={callState().isIncoming}
                  fallback={<span>Calling...</span>}
                >
                  <span>Incoming {callState().callType} call...</span>
                </Show>
              </Show>
            </p>
          </div>

          {/* Call Controls */}
          <div class="call-controls">
            {/* Accept/Reject buttons for incoming calls */}
            <Show when={callState().isIncoming && callState().isRinging}>
              <button 
                class="call-btn accept-btn" 
                onClick={() => webrtcService.acceptCall(
                  (window as any).__pendingCallOffer,
                  callState().callType!
                )} 
                title="Accept Call"
              >
                <PhoneIcon />
                <span>Accept</span>
              </button>
              <button 
                class="call-btn reject-btn" 
                onClick={() => webrtcService.rejectCall()}
                title="Reject Call"
              >
                <PhoneOffIcon />
                <span>Reject</span>
              </button>
            </Show>

            {/* Controls for active calls */}
            <Show when={callState().isInCall}>
              {/* Mute/Unmute */}
              <button 
                class={`call-btn ${callState().isMuted ? 'muted' : ''}`}
                onClick={() => webrtcService.toggleMute()}
                title={callState().isMuted ? 'Unmute' : 'Mute'}
              >
                <Show when={callState().isMuted} fallback={<MicIcon />}>
                  <MicOffIcon />
                </Show>
              </button>

              {/* Video On/Off (only for video calls) */}
              <Show when={callState().callType === 'video'}>
                <button 
                  class={`call-btn ${callState().isVideoOff ? 'video-off' : ''}`}
                  onClick={() => webrtcService.toggleVideo()}
                  title={callState().isVideoOff ? 'Turn On Camera' : 'Turn Off Camera'}
                >
                  <Show when={callState().isVideoOff} fallback={<VideoIcon />}>
                    <VideoOffIcon />
                  </Show>
                </button>
              </Show>

              {/* End Call */}
              <button 
                class="call-btn end-btn" 
                onClick={() => webrtcService.endCall()}
                title="End Call"
              >
                <PhoneOffIcon />
              </button>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
