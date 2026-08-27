class VoiceRoastJob < ApplicationJob
  queue_as :default

  def perform(room_result_id)
    result = RoomResult.find_by(id: room_result_id)
    return unless result

    voice_id = nil

    begin
      unless VoiceCloner.configured?
        result.update!(voice_roast_status: :unavailable)
        return
      end

      unless VoiceSampleStore.enough_samples?(room_id: result.room_id, user_id: result.user_id)
        result.update!(voice_roast_status: :unavailable)
        return
      end

      result.update!(voice_roast_status: :processing)

      sample_paths = VoiceSampleStore.sample_paths(room_id: result.room_id, user_id: result.user_id)
      voice_id = VoiceCloner.clone_voice("room#{result.room_id}-user#{result.user_id}", sample_paths)

      top_utterance = result.room.utterances
        .where(user_id: result.user_id)
        .where.not(cringe_score: nil)
        .order(cringe_score: :desc)
        .first
      top_phrase = top_utterance&.cringe_phrase.presence || top_utterance&.transcript.presence || "それ"

      line = CringeJudge.voice_roast_line(nickname: result.user.nickname, top_phrase: top_phrase)
      audio = VoiceCloner.text_to_speech(voice_id, line)

      FileUtils.mkdir_p(result.voice_roast_path.dirname)
      File.binwrite(result.voice_roast_path, audio)

      result.update!(voice_roast_status: :ready)
    rescue StandardError => e
      Rails.logger.error("VoiceRoastJob failed for room_result=#{room_result_id}: #{e.message}")
      result.update!(voice_roast_status: :failed)
    ensure
      # 早期returnの経路も含め、このジョブが動いた時点で音声サンプルは必ず不要になるので毎回破棄する
      VoiceCloner.delete_voice(voice_id) if voice_id
      VoiceSampleStore.cleanup_user(room_id: result.room_id, user_id: result.user_id)
      RoomChannel.broadcast_to(result.room, voice_roast_payload(result))
    end
  end

  private

  def voice_roast_payload(result)
    {
      event: "voice_roast_updated",
      user_id: result.user_id,
      status: result.voice_roast_status
    }
  end
end
