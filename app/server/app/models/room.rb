class Room < ApplicationRecord
  # 大人数だと会話が成立しなくなる(発話が重なる・Action Cableのブロードキャストが人数分飛ぶ)ための上限
  MAX_PARTICIPANTS = 6

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
