class Room < ApplicationRecord
  # サーバー容量の制約ではない(40人同時接続でも実測上問題ないことを確認済み)。
  # 大人数だと全員の発話が同時に画面へ流れ込み、会話として読めなくなるためのUX上の上限。
  MAX_PARTICIPANTS = 10

  belongs_to :host_user, class_name: "User"
  belongs_to :top_user, class_name: "User", optional: true
  has_many :room_participants, dependent: :destroy
  has_many :participants, through: :room_participants, source: :user
  has_many :utterances, dependent: :destroy
  has_many :room_results, dependent: :destroy

  enum :status, { waiting: 0, in_progress: 1, finished: 2 }

  before_validation :assign_passcode, on: :create

  validates :name, presence: true
  validates :passcode, presence: true, uniqueness: true

  # 写真・音声煽りを含めルームごとの保存データ量が大きいため、無制限に残さない。
  # 直近RETENTION_KEEP_COUNT件は経過日数に関わらず残し、それ以外は終了からRETENTION_PERIOD
  # 経過した時点で(発話・写真・音声もろとも)削除する
  RETENTION_KEEP_COUNT = 9
  RETENTION_PERIOD = 7.days

  def self.purge_expired!
    keep_ids = finished.order(finished_at: :desc).limit(RETENTION_KEEP_COUNT).pluck(:id)
    expired = finished.where.not(id: keep_ids).where(finished_at: ...RETENTION_PERIOD.ago)

    purged = 0
    expired.find_each do |room|
      VoiceSampleStore.cleanup_room(room_id: room.id)
      room.destroy!
      purged += 1
    rescue StandardError => e
      Rails.logger.error("Room.purge_expired!: failed to destroy room=#{room.id}: #{e.message}")
    end
    purged
  end

  private

  def assign_passcode
    self.passcode ||= SecureRandom.alphanumeric(6).upcase
  end
end
