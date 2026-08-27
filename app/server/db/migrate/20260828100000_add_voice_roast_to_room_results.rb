class AddVoiceRoastToRoomResults < ActiveRecord::Migration[8.1]
  def change
    add_column :room_results, :voice_roast_status, :string, null: false, default: "unavailable"
  end
end
