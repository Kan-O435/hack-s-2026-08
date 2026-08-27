class Room < ApplicationRecord
  # サーバー容量の制約ではない(40人同時接続でも実測上問題ないことを確認済み)。
  # 大人数だと全員の発話が同時に画面へ流れ込み、会話として読めなくなるためのUX上の上限。
  MAX_PARTICIPANTS = 10

  belongs_to :host_user, class_name: "User"
  belongs_to :top_user, class_name: "User", optional: true
  has_many :room_participants, dependent: :destroy
  has_many :participants, through: :room_participants, source: :user
  has_many :utterances, dependent: :destroy

  enum :status, { waiting: 0, in_progress: 1, finished: 2 }

  before_validation :assign_passcode, on: :create

  validates :name, presence: true
  validates :passcode, presence: true, uniqueness: true

  private

  def assign_passcode
    self.passcode ||= SecureRandom.alphanumeric(6).upcase
  end
end
