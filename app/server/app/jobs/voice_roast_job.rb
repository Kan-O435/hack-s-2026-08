class VoiceRoastJob < ApplicationJob
  queue_as :default

  # 多少品質が落ちてもいい前提であえて低めに設定している(ElevenLabsの推奨は30秒〜)
  MIN_SPOKEN_DURATION_MS = 6_000

  def perform(room_result_id)
    result = RoomResult.find_by(id: room_result_id)
    return unless result

    voice_id = nil

    begin
      unless VoiceCloner.configured?
        Rails.logger.warn("VoiceRoastJob: ELEVENLABS_API_KEY未設定のためスキップ room_result=#{room_result_id}")
        result.update!(voice_roast_status: :unavailable)
        return
      end

      total_duration_ms = result.room.utterances.where(user_id: result.user_id).sum(:duration_ms)
      if total_duration_ms < MIN_SPOKEN_DURATION_MS
        Rails.logger.warn(
          "VoiceRoastJob: 発話時間が足りないためスキップ room_result=#{room_result_id} duration_ms=#{total_duration_ms}"
        )
        result.update!(voice_roast_status: :unavailable)
        return
      end

      sample_paths = VoiceSampleStore.sample_paths(room_id: result.room_id, user_id: result.user_id)
      if sample_paths.empty?
        # 本番環境(Railway等)はファイルシステムが揮発性のため、デプロイ直後などでサンプルが
        # 消えていることがある。DB上は発話時間があるのにここに来る場合はそれを疑うこと
        Rails.logger.warn("VoiceRoastJob: 音声サンプルファイルが見つからない room_result=#{room_result_id}")
        result.update!(voice_roast_status: :unavailable)
        return
      end

      result.update!(voice_roast_status: :processing)

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
