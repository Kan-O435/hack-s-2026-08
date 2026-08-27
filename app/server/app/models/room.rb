class Room < ApplicationRecord
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
