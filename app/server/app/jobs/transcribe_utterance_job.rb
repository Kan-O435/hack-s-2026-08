class TranscribeUtteranceJob < ApplicationJob
  queue_as :default

  # 3回リトライしても失敗した場合、無言で(文字起こし中...)のまま止まらないよう、
  # 失敗を表す文言に置き換えて通知する
  retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
    utterance = Utterance.find_by(id: job.arguments.first)
    next unless utterance

    Rails.logger.error("TranscribeUtteranceJob failed permanently for utterance=#{utterance.id}: #{error.message}")
    utterance.update!(transcript: "(文字起こしに失敗しました)")
    RoomChannel.broadcast_to(utterance.room, job.send(:transcribed_payload, utterance))
  end

  def perform(utterance_id, audio_base64, content_type)
    utterance = Utterance.find_by(id: utterance_id)
    return unless utterance

    audio_bytes = Base64.decode64(audio_base64)
    extension = extension_for(content_type)

    VoiceSampleStore.save(
      room_id: utterance.room_id,
      user_id: utterance.user_id,
      utterance_id: utterance.id,
      extension: extension,
      bytes: audio_bytes
    )

    transcript = WhisperTranscriber.transcribe(
      audio_bytes,
      filename: "utterance.#{extension}",
      content_type: content_type
    )
    transcript = TranscriptRefiner.refine(transcript)

    utterance.update!(transcript: transcript.presence || "(聞き取れませんでした)")

    RoomChannel.broadcast_to(utterance.room, transcribed_payload(utterance))
    JudgeUtteranceJob.perform_later(utterance.id)
  end

  private

  def extension_for(content_type)
    case content_type
    when /mp4/ then "mp4"
    when /ogg/ then "ogg"
    when /wav/ then "wav"
    else "webm"
    end
  end

  def transcribed_payload(utterance)
    {
      event: "utterance_transcribed",
      utterance: {
        id: utterance.id,
        room_id: utterance.room_id,
        user_id: utterance.user_id,
        nickname: utterance.user.nickname,
        transcript: utterance.transcript,
        spoken_at: utterance.spoken_at
      }
    }
  end
end
