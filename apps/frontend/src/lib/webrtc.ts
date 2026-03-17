// WebRTC service for voice and video calls
import { createSignal } from 'solid-js';

export type CallType = 'voice' | 'video';

export interface CallState {
  isInCall: boolean;
  callType: CallType | null;
  isMuted: boolean;
  isVideoOff: boolean;
  remoteUserId: string | null;
  remoteUsername: string | null;
  isRinging: boolean;
  isIncoming: boolean;
}

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private ws: WebSocket | null = null;
  private roomId: string | null = null;

  // ICE servers (using free Google STUN server)
  private iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  // State
  public callState = createSignal<CallState>({
    isInCall: false,
    callType: null,
    isMuted: false,
    isVideoOff: false,
    remoteUserId: null,
    remoteUsername: null,
    isRinging: false,
    isIncoming: false,
  });

  setWebSocket(ws: WebSocket | null, roomId: string) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.error('[WebRTC] Cannot set WebSocket - not connected');
      return;
    }
    this.ws = ws;
    this.roomId = roomId;
    console.log('[WebRTC] WebSocket set successfully for room:', roomId);
  }

  private isLocalhostContext() {
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }

  getUnsupportedReason(): string | null {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return 'Panggilan belum tersedia di lingkungan ini.';
    }

    if (typeof RTCPeerConnection === 'undefined') {
      return 'Browser ini belum mendukung voice/video call.';
    }

    if (!window.isSecureContext && !this.isLocalhostContext()) {
      return 'Voice/video call di mobile memerlukan HTTPS atau localhost. Buka app lewat HTTPS agar kamera dan mikrofon bisa dipakai.';
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      return 'Browser ini tidak menyediakan akses kamera/mikrofon. Di iPhone/iPad biasanya ini terjadi jika app dibuka lewat HTTP, bukan HTTPS.';
    }

    return null;
  }

  private async requestUserMedia(callType: CallType) {
    const unsupportedReason = this.getUnsupportedReason();
    if (unsupportedReason) {
      throw new Error(unsupportedReason);
    }

    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video',
    });
  }

  async startCall(callType: CallType, remoteUserId: string, remoteUsername: string) {
    try {
      console.log(`[WebRTC] Starting ${callType} call to ${remoteUsername} (ID: ${remoteUserId})`);
      console.log('[WebRTC] User Agent:', navigator.userAgent);
      console.log('[WebRTC] WebSocket state:', this.ws?.readyState, 'Room:', this.roomId);

      console.log('[WebRTC] Requesting media permissions for', callType, 'call');
      this.localStream = await this.requestUserMedia(callType);
      console.log('[WebRTC] Got local stream:', this.localStream.getTracks().length, 'tracks');

      // Create peer connection
      this.peerConnection = new RTCPeerConnection(this.iceServers);
      console.log('[WebRTC] Peer connection created');

      // Monitor connection state
      this.peerConnection.onconnectionstatechange = () => {
        console.log('[WebRTC] Connection state:', this.peerConnection?.connectionState);
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE connection state:', this.peerConnection?.iceConnectionState);
      };

      // Add local stream tracks to peer connection
      this.localStream.getTracks().forEach(track => {
        console.log('[WebRTC] Adding track:', track.kind, track.label);
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.ws) {
          console.log('[WebRTC] Sending ICE candidate');
          this.ws.send(JSON.stringify({
            type: 'call-ice-candidate',
            candidate: event.candidate,
            target_user_id: remoteUserId,
          }));
        }
      };

      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        console.log('[WebRTC] (startCall) Received remote track:', event.track.kind, 'id:', event.track.id, 'streams:', event.streams.length);
        this.remoteStream = event.streams[0];
        console.log('[WebRTC] (startCall) Remote stream has', this.remoteStream.getTracks().length, 'tracks');
        setTimeout(() => {
          const remoteVideo = document.getElementById('remote-video') as HTMLVideoElement;
          if (remoteVideo) {
            remoteVideo.srcObject = this.remoteStream;
            remoteVideo.play().catch(e => console.error('[WebRTC] Failed to play remote video:', e));
            console.log('[WebRTC] (startCall) Remote video attached and playing');
          } else {
            console.error('[WebRTC] (startCall) remote-video element not found!');
          }
        }, 100);
      };

      // Create offer
      console.log('[WebRTC] Creating offer...');
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      console.log('[WebRTC] Offer created and set as local description');
      console.log('[WebRTC] Offer SDP includes video:', offer.sdp?.includes('m=video'));
      console.log('[WebRTC] Offer SDP includes audio:', offer.sdp?.includes('m=audio'));

      // Send offer via WebSocket
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const offerMessage = {
          type: 'call-offer',
          call_type: callType,
          offer: offer,
          target_user_id: remoteUserId,
          caller_username: localStorage.getItem('display_name') || localStorage.getItem('username') || (localStorage.getItem('email') || 'User'),
        };
        console.log('[WebRTC] Sending offer to target:', remoteUserId);
        console.log('[WebRTC] Offer message:', JSON.stringify(offerMessage).substring(0, 200));
        this.ws.send(JSON.stringify(offerMessage));
        console.log('[WebRTC] ✅ Offer sent successfully');
      } else {
        console.error('[WebRTC] ❌ Cannot send offer - WebSocket not connected!', this.ws?.readyState);
        throw new Error('WebSocket not connected');
      }

      // Update state
      const [, setCallState] = this.callState;
      setCallState({
        isInCall: true,
        callType,
        isMuted: false,
        isVideoOff: false,
        remoteUserId,
        remoteUsername,
        isRinging: true,
        isIncoming: false,
      });
      console.log('[WebRTC] Call state updated - ringing');

      // Attach local stream to video element (with retry for DOM ready)
      setTimeout(() => {
        const localVideo = document.getElementById('local-video') as HTMLVideoElement;
        if (localVideo && this.localStream) {
          localVideo.srcObject = this.localStream;
          localVideo.play().catch(e => console.error('[WebRTC] Failed to play local video:', e));
          console.log('[WebRTC] Local video attached and playing');
        } else {
          console.warn('[WebRTC] Local video element not found yet');
        }
      }, 100);

    } catch (error) {
      console.error('[WebRTC] ❌ Failed to start call:', error);
      if (error instanceof DOMException) {
        console.error('[WebRTC] DOMException:', error.name, error.message);
        if (error.name === 'NotAllowedError') {
          alert('Camera/Microphone permission denied. Please allow access and try again.');
        } else if (error.name === 'NotFoundError') {
          alert('No camera/microphone found on this device.');
        } else {
          alert('Failed to access camera/microphone: ' + error.message);
        }
      } else {
        alert('Failed to start call: ' + (error as Error).message);
      }
      this.endCall();
    }
  }

  async handleCallOffer(offer: RTCSessionDescriptionInit, callType: CallType, remoteUserId: string, remoteUsername: string) {
    try {
      console.log(`[WebRTC] Received ${callType} call from ${remoteUsername}`);

      // Update state to show incoming call
      const [, setCallState] = this.callState;
      setCallState({
        isInCall: false,
        callType,
        isMuted: false,
        isVideoOff: false,
        remoteUserId,
        remoteUsername,
        isRinging: true,
        isIncoming: true,
      });

      // Play ringtone (optional)
      // const ringtone = new Audio('/notification/ringtone.mp3');
      // ringtone.loop = true;
      // ringtone.play();

    } catch (error) {
      console.error('[WebRTC] Failed to handle call offer:', error);
    }
  }

  async acceptCall(offer: RTCSessionDescriptionInit, callType: CallType) {
    try {
      console.log('[WebRTC] Accepting call');

      const [callStateGetter, setCallState] = this.callState;
      const callStateValue = callStateGetter(); // Get current state

      this.localStream = await this.requestUserMedia(callType);

      // Create peer connection
      this.peerConnection = new RTCPeerConnection(this.iceServers);

      // Monitor connection state
      this.peerConnection.onconnectionstatechange = () => {
        console.log('[WebRTC] (acceptCall) Connection state:', this.peerConnection?.connectionState);
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        console.log('[WebRTC] (acceptCall) ICE connection state:', this.peerConnection?.iceConnectionState);
      };

      // Add local stream tracks
      console.log('[WebRTC] (acceptCall) Adding local tracks to peer connection...');
      this.localStream.getTracks().forEach(track => {
        console.log(`[WebRTC] (acceptCall) Adding ${track.kind} track:`, track.id, 'enabled:', track.enabled);
        const sender = this.peerConnection!.addTrack(track, this.localStream!);
        console.log('[WebRTC] (acceptCall) Track added, sender:', sender.track?.id);
      });
      console.log('[WebRTC] (acceptCall) Total senders:', this.peerConnection.getSenders().length);

      // Handle ICE candidates
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.ws) {
          this.ws.send(JSON.stringify({
            type: 'call-ice-candidate',
            candidate: event.candidate,
            target_user_id: callStateValue.remoteUserId,
          }));
        }
      };

      // Handle remote stream
      this.peerConnection.ontrack = (event) => {
        console.log('[WebRTC] (acceptCall) Received remote track:', event.track.kind, 'id:', event.track.id, 'streams:', event.streams.length);
        this.remoteStream = event.streams[0];
        console.log('[WebRTC] (acceptCall) Remote stream has', this.remoteStream.getTracks().length, 'tracks');
        setTimeout(() => {
          const remoteVideo = document.getElementById('remote-video') as HTMLVideoElement;
          if (remoteVideo) {
            remoteVideo.srcObject = this.remoteStream;
            remoteVideo.play().catch(e => console.error('[WebRTC] Failed to play remote video:', e));
            console.log('[WebRTC] (acceptCall) Remote video attached and playing');
          } else {
            console.error('[WebRTC] (acceptCall) remote-video element not found!');
          }
        }, 100);
      };

      // Set remote description
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Create answer
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      console.log('[WebRTC] (acceptCall) Answer created and set as local description');
      console.log('[WebRTC] (acceptCall) Answer SDP includes video:', answer.sdp?.includes('m=video'));
      console.log('[WebRTC] (acceptCall) Answer SDP includes audio:', answer.sdp?.includes('m=audio'));

      // Send answer via WebSocket
      if (this.ws) {
        this.ws.send(JSON.stringify({
          type: 'call-answer',
          answer: answer,
          target_user_id: callStateValue.remoteUserId,
        }));
      }

      // Update state
      setCallState(prev => ({
        ...prev,
        isInCall: true,
        isRinging: false,
        isIncoming: false,
      }));

      // Attach local stream to video element (with retry for DOM ready)
      setTimeout(() => {
        const localVideo = document.getElementById('local-video') as HTMLVideoElement;
        if (localVideo && this.localStream) {
          localVideo.srcObject = this.localStream;
          localVideo.play().catch(e => console.error('[WebRTC] Failed to play local video:', e));
          console.log('[WebRTC] Local video attached and playing');
        }
      }, 100);

    } catch (error) {
      console.error('[WebRTC] Failed to accept call:', error);
      alert((error as Error).message || 'Failed to access camera/microphone. Please grant permissions.');
      this.rejectCall();
    }
  }

  async handleCallAnswer(answer: RTCSessionDescriptionInit) {
    try {
      console.log('[WebRTC] Received call answer');
      if (this.peerConnection) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        
        // Update state - call connected
        const [, setCallState] = this.callState;
        setCallState(prev => ({
          ...prev,
          isRinging: false,
        }));
      }
    } catch (error) {
      console.error('[WebRTC] Failed to handle call answer:', error);
    }
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit) {
    try {
      if (this.peerConnection) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('[WebRTC] Failed to add ICE candidate:', error);
    }
  }

  rejectCall() {
    console.log('[WebRTC] Rejecting call');
    const [callStateGetter] = this.callState;
    const callStateValue = callStateGetter();
    
    // Notify remote user
    if (this.ws && callStateValue.remoteUserId) {
      this.ws.send(JSON.stringify({
        type: 'call-rejected',
        target_user_id: callStateValue.remoteUserId,
      }));
    }

    this.endCall();
  }

  endCall() {
    console.log('[WebRTC] Ending call');

    const [callStateGetter] = this.callState;
    const callStateValue = callStateGetter();

    // Notify remote user if in call
    if (this.ws && callStateValue.isInCall && callStateValue.remoteUserId) {
      this.ws.send(JSON.stringify({
        type: 'call-ended',
        target_user_id: callStateValue.remoteUserId,
      }));
    }

    // Stop all tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach(track => track.stop());
      this.remoteStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Reset state
    const [, setCallStateEnd] = this.callState;
    setCallStateEnd({
      isInCall: false,
      callType: null,
      isMuted: false,
      isVideoOff: false,
      remoteUserId: null,
      remoteUsername: null,
      isRinging: false,
      isIncoming: false,
    });
  }

  toggleMute() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const [, setCallStateMute] = this.callState;
        setCallStateMute(prev => ({ ...prev, isMuted: !audioTrack.enabled }));
      }
    }
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const [, setCallStateVideo] = this.callState;
        setCallStateVideo(prev => ({ ...prev, isVideoOff: !videoTrack.enabled }));
      }
    }
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }
}

export const webrtcService = new WebRTCService();
