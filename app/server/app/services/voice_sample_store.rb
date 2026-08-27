# 会話中の生音声を、音声クローン生成に使うまでの間だけ一時保存しておくストア。
# 恒久保存はしない(結果生成後にそのルームの分は必ず破棄する)。
class VoiceSampleStore
  def self.save(room_id:, user_id:, utterance_id:, extension:, bytes:)
    dir = dir_for(room_id, user_id)
    FileUtils.mkdir_p(dir)
    File.binwrite(dir.join("#{utterance_id}.#{extension}"), bytes)
  end

  def self.sample_paths(room_id:, user_id:)
    Dir.glob(dir_for(room_id, user_id).join("*")).sort
  end

  def self.cleanup_user(room_id:, user_id:)
    FileUtils.rm_rf(dir_for(room_id, user_id))
  end

  def self.cleanup_room(room_id:)
    FileUtils.rm_rf(room_dir(room_id))
  end

  def self.dir_for(room_id, user_id)
    room_dir(room_id).join(user_id.to_s)
  end
  private_class_method :dir_for

  def self.room_dir(room_id)
    Rails.root.join("tmp", "voice_samples", room_id.to_s)
  end
  private_class_method :room_dir
end
